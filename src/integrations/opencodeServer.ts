import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { resolveBinary } from "./opencode.js";

const execFileAsync = promisify(execFile);
const log = loggerFor("integrations:opencode-server");

/**
 * Engine Developer via **OpenCode server (HTTP API v2)**.
 *
 * Alih-alih spawn `opencode run` per tugas (rawan hang karena stdio server
 * privat), kami mengirim tugas ke *background service* OpenCode:
 *   - URL service  : didapat dari `opencode service status`.
 *   - Password     : dari `~/.config/opencode/service.json`.
 *   - Auth         : HTTP Basic `opencode:<password>`.
 *
 * Alur: create session (location=repo, agent+model) → prompt → tunggu outcome →
 * baca pesan assistant. Permission dijawab otomatis (auto-approve) bila diminta.
 */

interface ServiceInfo {
  url: string;
  password: string;
}

let cached: ServiceInfo | null = null;

export function resetOpencodeServerCache(): void {
  cached = null;
}

async function resolveService(): Promise<ServiceInfo> {
  if (cached) return cached;

  let password = "";
  const cfgPath =
    env.DEVELOPER_OPENCODE_SERVER_JSON ||
    resolve(homedir(), ".config", "opencode", "service.json");
  try {
    const raw = await readFile(cfgPath, "utf8");
    password = (JSON.parse(raw) as { password?: string }).password ?? "";
  } catch {
    /* biarkan kosong */
  }

  let url = env.DEVELOPER_OPENCODE_SERVER_URL;
  if (!url) {
    try {
      const { stdout } = await execFileAsync(resolveBinary("opencode"), ["service", "status"], {
        windowsHide: true,
        timeout: 15_000,
      });
      url = stdout.trim().split(/\s+/).find((s) => /^https?:\/\//.test(s)) ?? "";
    } catch {
      /* biarkan kosong */
    }
  }

  if (!url || !password) {
    throw new Error(
      "OpenCode server tidak tersedia (URL service / password tidak ditemukan). Jalankan `opencode service start`.",
    );
  }
  cached = { url: url.replace(/\/$/, ""), password };
  log.info({ url: cached.url }, "opencode-server siap");
  return cached;
}

function authHeader(password: string): string {
  return "Basic " + Buffer.from(`opencode:${password}`).toString("base64");
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, password } = await resolveService();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: authHeader(password),
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`opencode-server ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface OpencodeServerRunResult {
  text: string;
  sessionId: string;
  model: string;
}

export async function opencodeServerRun(args: {
  prompt: string;
  cwd?: string;
  model?: string;
  agent?: string;
  auto?: boolean;
  timeoutMs?: number;
}): Promise<OpencodeServerRunResult> {
  const cwd = args.cwd ?? process.cwd();
  const modelStr = args.model ?? (env.DEVELOPER_OPENCODE_MODEL || "deepseek/deepseek-flash");
  const [providerID, id] = modelStr.includes("/") ? modelStr.split("/") : ["deepseek", modelStr];
  const agent = args.agent ?? (env.DEVELOPER_OPENCODE_AGENT || "build");
  const timeoutMs = args.timeoutMs ?? env.DEVELOPER_OPENCODE_TIMEOUT_MS;
  const auto = args.auto ?? true;

  const created = await api<{ data: { id: string } }>("/api/session", {
    method: "POST",
    body: JSON.stringify({ location: { directory: cwd }, agent, model: { providerID, id } }),
  });
  const sessionId = created.data.id;
  log.info({ sessionId, cwd, model: modelStr, agent }, "opencode-server: sesi dibuat");

  await api(`/api/session/${sessionId}/prompt`, {
    method: "POST",
    body: JSON.stringify({ text: args.prompt }),
  });

  const startedAt = Date.now();
  let outcome: string | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    if (auto) {
      try {
        const perms = await api<{ data: Array<{ id: string }> }>(`/api/session/${sessionId}/permission`);
        for (const p of perms.data ?? []) {
          await api(`/api/session/${sessionId}/permission/${p.id}/reply`, {
            method: "POST",
            body: JSON.stringify({ decision: "always" }),
          });
        }
      } catch {
        /* abaikan */
      }
    }
    const info = await api<{ data: { outcome?: string } }>(`/api/session/${sessionId}`);
    if (info.data.outcome) {
      outcome = info.data.outcome;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!outcome) throw new Error(`opencode-server timeout setelah ${timeoutMs}ms`);
  if (outcome !== "succeeded") throw new Error(`opencode-server outcome=${outcome}`);

  const msgs = await api<{
    data: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
  }>(`/api/session/${sessionId}/message?type=assistant&order=desc&limit=5`);
  const assistant = (msgs.data ?? [])[0];
  const text = (assistant?.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("")
    .trim();

  log.info({ sessionId, outcome, chars: text.length }, "opencode-server selesai");
  return { text, sessionId, model: modelStr };
}
