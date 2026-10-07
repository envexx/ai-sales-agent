import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("integration:camoufox");
const here = dirname(fileURLToPath(import.meta.url));

export interface CamoufoxPage {
  url: string;
  title: string;
  text: string;
  html: string;
  screenshotPath: string | null;
}

/** Cari `scripts/camoufox_fetch.py` dari repo root (src/ maupun dist/). */
function scriptPath(): string {
  const candidates = [
    resolve(process.cwd(), "scripts/camoufox_fetch.py"),
    resolve(here, "../../../scripts/camoufox_fetch.py"),
    resolve(here, "../../scripts/camoufox_fetch.py"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

let availability: boolean | null = null;

/** Cek sekali apakah modul `camoufox` tersedia di Python yang dikonfigurasi. */
export async function camoufoxAvailable(): Promise<boolean> {
  if (!env.CAMOUFOX_ENABLED) return false;
  if (availability !== null) return availability;
  availability = await new Promise<boolean>((res) => {
    const child = spawn(env.CAMOUFOX_PYTHON, ["-c", "import camoufox"], { windowsHide: true });
    child.on("error", () => res(false));
    child.on("close", (code) => res(code === 0));
  });
  if (!availability) {
    log.warn(
      { python: env.CAMOUFOX_PYTHON },
      "camoufox tidak tersedia — ingestion akan memakai Firecrawl",
    );
  }
  return availability;
}

/**
 * Ambil satu halaman dengan browser stealth Camoufox (via skrip Python).
 *
 * Skrip mencetak satu objek JSON ke stdout; log/progress ke stderr diabaikan.
 */
export async function camoufoxFetch(
  url: string,
  opts: { timeoutMs?: number; screenshotDir?: string; format?: "markdown" | "text" } = {},
): Promise<CamoufoxPage | null> {
  if (!env.CAMOUFOX_ENABLED) return null;
  if (!(await camoufoxAvailable())) return null;

  const timeoutMs = opts.timeoutMs ?? env.CAMOUFOX_TIMEOUT_MS;
  const args = [scriptPath(), url, "--timeout", String(timeoutMs)];
  if (opts.screenshotDir) args.push("--screenshot-dir", opts.screenshotDir);

  return new Promise<CamoufoxPage | null>((res) => {
    const child = spawn(env.CAMOUFOX_PYTHON, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      log.warn({ url }, "camoufox timeout");
      res(null);
    }, timeoutMs + 15_000);

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      log.warn({ url, err: err.message }, "camoufox spawn error");
      res(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout.trim()) as CamoufoxPage;
        res(parsed.text || parsed.html ? parsed : null);
      } catch {
        log.warn({ url, stderr: stderr.slice(-400) }, "camoufox output tidak valid");
        res(null);
      }
    });
  });
}
