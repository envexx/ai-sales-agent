import { spawn } from "node:child_process";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("llm:antigravity");

export interface AntigravityRunResult {
  response: string;
  structured: unknown | null;
  usage: Record<string, unknown> | null;
  conversationId: string | null;
}

export interface AntigravityRunArgs {
  prompt: string;
  system?: string;
  jsonSchema?: unknown;
  model?: string;
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
}

/** Kandidat nama binary (Windows sering berupa shim .cmd/.exe). */
function candidates(bin: string): string[] {
  if (process.platform !== "win32") return [bin];
  if (/\.(exe|cmd|bat)$/i.test(bin)) return [bin];
  return [bin, `${bin}.exe`, `${bin}.cmd`];
}

/** Jalankan CLI dan kembalikan stdout; melempar bila exit != 0 atau timeout. */
function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const trySpawn = (list: string[], index: number): void => {
      const candidate = list[index];
      if (!candidate) {
        reject(new Error(`antigravity binary not found (tried: ${list.join(", ")})`));
        return;
      }

      const child = spawn(candidate, args, { windowsHide: true });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`antigravity timeout after ${timeoutMs}ms`));
      }, timeoutMs + 15_000);

      let settled = false;
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Binary tidak ditemukan → coba kandidat berikutnya.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") trySpawn(list, index + 1);
        else reject(err);
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`antigravity exit ${code}: ${stderr.trim().slice(-300)}`));
          return;
        }
        resolve(stdout.trim());
      });
    };

    trySpawn(candidates(bin), 0);
  });
}

/** Jalankan satu prompt headless dan parse envelope JSON-nya. */
export async function antigravityRun(args: AntigravityRunArgs): Promise<AntigravityRunResult> {
  const prompt = args.system ? `${args.system}\n\n${args.prompt}` : args.prompt;
  const timeoutMs = args.timeoutMs ?? env.ANTIGRAVITY_TIMEOUT_MS;

  const cliArgs = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--print-timeout",
    `${Math.ceil(timeoutMs / 1000)}s`,
  ];

  const model = args.model ?? env.ANTIGRAVITY_MODEL;
  if (model) cliArgs.push("--model", model);
  const effort = args.effort ?? env.ANTIGRAVITY_EFFORT;
  if (effort) cliArgs.push("--effort", effort);
  if (args.jsonSchema) cliArgs.push("--json-schema", JSON.stringify(args.jsonSchema));

  const raw = await run(env.ANTIGRAVITY_BIN, cliArgs, timeoutMs);

  let parsed: {
    status?: string;
    response?: string;
    error?: string;
    structured_output?: unknown;
    usage?: Record<string, unknown>;
    conversation_id?: string;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error(`antigravity: output bukan JSON (${raw.slice(0, 200)})`);
  }

  if (parsed.status !== "SUCCESS") {
    throw new Error(`antigravity status ${parsed.status ?? "UNKNOWN"}: ${parsed.error ?? ""}`);
  }

  return {
    response: parsed.response ?? "",
    structured: parsed.structured_output ?? null,
    usage: parsed.usage ?? null,
    conversationId: parsed.conversation_id ?? null,
  };
}

let availability: boolean | null = null;

/** Cek sekali apakah binary `agy` tersedia (untuk status & fallback). */
export async function antigravityAvailable(): Promise<boolean> {
  if (!env.ANTIGRAVITY_ENABLED) return false;
  if (availability !== null) return availability;
  try {
    await run(env.ANTIGRAVITY_BIN, ["--version"], 20_000);
    availability = true;
  } catch (err) {
    log.warn({ err: (err as Error).message }, "antigravity CLI tidak tersedia");
    availability = false;
  }
  return availability;
}

/** Reset cache deteksi (mis. setelah instalasi). */
export function resetAntigravityAvailability(): void {
  availability = null;
}
