import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("integrations:opencode");

/**
 * Engine **OpenCode** (headless CLI) untuk agent Developer (D4).
 *
 * Dijalankan sebagai proses `opencode run <prompt> --format json` di dalam
 * direktori kerja target (repo klien). Output OpenCode berbentuk **JSON Lines**
 * (satu event JSON per baris: `step_start`, `text`, `error`, dst) — parser di
 * bawah mengumpulkan bagian teks dan melempar bila ada event `error` tanpa output.
 *
 * CATATAN Windows: `opencode` di PATH biasanya berupa shim `.cmd` (npm). Node
 * 24 **menolak** spawn `.cmd` tanpa `shell` (EINVAL). Karena itu `resolveBinary`
 * mencari `.exe` asli (mis. `...\@opencode\cli\bin\opencode.exe`) agar kita bisa
 * spawn tanpa shell — argumen multi-baris & path berspasi jadi aman.
 */

export interface OpencodeRunArgs {
  prompt: string;
  /** Direktori kerja OpenCode (biasanya folder repo klien). */
  cwd?: string;
  model?: string;
  agent?: string;
  /** Auto-approve permission OpenCode (perubahan file). Default true. */
  auto?: boolean;
  /** Jalankan dengan server privat (`--standalone`) agar proses exit rapi. */
  standalone?: boolean;
  timeoutMs?: number;
}

export interface OpencodeRunResult {
  text: string;
  raw: string;
  sessionId: string | null;
}

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function pathDirs(): string[] {
  return (process.env.PATH ?? process.env.Path ?? "").split(delimiter).filter(Boolean);
}

/**
 * Resolusi binary: di Windows, npm memasang `bin` sebagai `.cmd`/`.ps1` yang
 * membungkus `.exe` sebenarnya. Kita kembalikan `.exe` tersebut agar bisa
 * di-spawn tanpa `shell:true` (menghindari EINVAL & masalah quoting).
 */
export function resolveBinary(bin: string): string {
  if (process.platform !== "win32") return bin;
  if (/\.(exe|cmd|bat)$/i.test(bin) && existsSync(bin)) return bin;

  const dirs = pathDirs();
  for (const dir of dirs) {
    const exe = join(dir, `${bin}.exe`);
    if (existsSync(exe)) return exe;
  }

  for (const dir of dirs) {
    for (const shim of [`${bin}.cmd`, `${bin}.ps1`, bin]) {
      const shimPath = join(dir, shim);
      if (!existsSync(shimPath)) continue;
      try {
        const text = readFileSync(shimPath, "utf8");
        const match = text.match(/"([^"]+\.exe)"/i) ?? text.match(/(\S+\.exe)/i);
        if (!match) continue;
        const target = match[1]!
          .replace(/%dp0%[\\/]?/gi, `${dir}\\`)
          .replace(/\$basedir[\\/]?/gi, `${dir}\\`);
        if (existsSync(target)) return target;
      } catch {
        /* lanjutkan kandidat berikutnya */
      }
    }
  }

  return bin;
}

/** Jalankan CLI, tangkap stdout/stderr; error ENOENT/EINVAL mencoba kandidat berikutnya. */
function execCommand(
  bin: string,
  args: string[],
  opts: { cwd?: string; timeoutMs: number },
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const done = (fn: () => void) => {
      if (finished) return;
      finished = true;
      fn();
    };

    const trySpawn = (list: string[], index: number): void => {
      const candidate = list[index];
      if (!candidate) {
        done(() => reject(new Error(`opencode tidak ditemukan (dicoba: ${list.join(", ")})`)));
        return;
      }

      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(candidate, args, { cwd: opts.cwd, windowsHide: true });
      } catch (err) {
        // Node melempar sinkron untuk `.cmd` di Windows (EINVAL) — coba berikutnya.
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EINVAL") {
          trySpawn(list, index + 1);
          return;
        }
        done(() => reject(err));
        return;
      }

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        done(() => reject(new Error(`opencode timeout setelah ${opts.timeoutMs}ms`)));
      }, opts.timeoutMs + 15_000);

      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

      child.on("error", (err) => {
        clearTimeout(timer);
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EINVAL") {
          trySpawn(list, index + 1);
          return;
        }
        done(() => reject(err));
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        done(() => resolve({ code: code ?? -1, stdout, stderr }));
      });

      // `exit` = proses utama benar-benar selesai. `close` bisa tertunda bila ada
      // proses anak (mis. server privat `--standalone`) yang mewarisi stdio →
      // resolve lebih dulu agar tidak menggantung sampai timeout.
      child.on("exit", (code) => {
        setTimeout(() => {
          clearTimeout(timer);
          done(() => resolve({ code: code ?? -1, stdout, stderr }));
        }, 800);
      });
    };

    // Kandidat: hasil resolusi .exe lebih dulu, lalu nama apa adanya (PATH).
    const resolved = resolveBinary(bin);
    trySpawn([resolved, bin], 0);
  });
}

/** Parse output JSON Lines OpenCode → teks gabungan + deteksi error. */
export function parseOpencodeJsonl(raw: string, code = 0): OpencodeRunResult {
  const parts: string[] = [];
  const plain: string[] = [];
  let sessionId: string | null = null;
  let error: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      plain.push(trimmed);
      continue;
    }
    const evt = event as {
      type?: string;
      sessionID?: string;
      text?: string;
      part?: { type?: string; text?: string };
      error?: { message?: string } & Record<string, unknown>;
    };
    if (evt.sessionID && !sessionId) sessionId = evt.sessionID;

    if (evt.type === "error") {
      error = evt.error?.message ?? JSON.stringify(evt.error ?? evt);
    } else if (evt.part?.type === "text" && typeof evt.part.text === "string") {
      parts.push(evt.part.text);
    } else if (typeof evt.text === "string") {
      parts.push(evt.text);
    }
  }

  const text = (parts.length ? parts.join("") : plain.join("\n")).trim();
  if (error && !text) throw new Error(`opencode: ${error}`);
  if (code !== 0 && !text) throw new Error(`opencode exit ${code}${error ? `: ${error}` : ""}`);
  if (error) log.warn({ error }, "opencode melaporkan error meski ada output");

  return { text, raw, sessionId };
}

/** Jalankan satu prompt OpenCode headless. */
export async function opencodeRun(args: OpencodeRunArgs): Promise<OpencodeRunResult> {
  const timeoutMs = args.timeoutMs ?? env.DEVELOPER_OPENCODE_TIMEOUT_MS;
  const cliArgs = ["run", args.prompt, "--format", "json"];

  const model = args.model ?? env.DEVELOPER_OPENCODE_MODEL;
  if (model) cliArgs.push("--model", model);
  const agent = args.agent ?? env.DEVELOPER_OPENCODE_AGENT;
  if (agent) cliArgs.push("--agent", agent);
  if (args.auto ?? true) cliArgs.push("--auto");
  // Server privat: penting agar proses `opencode run` benar-benar keluar
  // (tanpa ini, proses bisa menggantung menunggu background service).
  if (args.standalone ?? env.DEVELOPER_OPENCODE_STANDALONE) cliArgs.push("--standalone");

  log.info(
    { cwd: args.cwd ?? process.cwd(), model: model || "(default)", agent: agent || "(default)" },
    "menjalankan opencode",
  );

  const result = await execCommand(env.DEVELOPER_OPENCODE_BIN, cliArgs, {
    cwd: args.cwd,
    timeoutMs,
  });
  return parseOpencodeJsonl(result.stdout, result.code);
}

let availability: boolean | null = null;

/** Cek sekali apakah binary OpenCode tersedia (untuk status & fallback). */
export async function opencodeAvailable(): Promise<boolean> {
  if (!env.DEVELOPER_ENABLED) return false;
  if (availability !== null) return availability;
  try {
    await execCommand(env.DEVELOPER_OPENCODE_BIN, ["--version"], { timeoutMs: 20_000 });
    availability = true;
  } catch (err) {
    log.warn({ err: (err as Error).message }, "OpenCode CLI tidak tersedia");
    availability = false;
  }
  return availability;
}

/** Reset cache deteksi (mis. setelah instalasi). */
export function resetOpencodeAvailability(): void {
  availability = null;
}
