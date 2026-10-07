import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("developer:shell");

/** Jalankan `tsc --noEmit` (pakai node langsung, aman di Windows tanpa shell). */
export async function runTypecheck(
  repoDir: string,
  timeoutMs = 180_000,
): Promise<{ ok: boolean; output: string }> {
  const tsc = resolve(repoDir, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tsc)) return { ok: true, output: "tsc tidak ditemukan — typecheck dilewati" };

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [tsc, "-p", "tsconfig.json", "--noEmit"], {
      cwd: repoDir,
      windowsHide: true,
    });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      resolvePromise({ ok: false, output: "typecheck timeout" });
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    child.stderr.on("data", (c: Buffer) => (out += c.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, output: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ ok: code === 0, output: out.trim().slice(-4000) });
    });
  });
}

/** Restart aplikasi PM2 (detached, agar tetap jalan walau proses ini ikut berhenti). */
export function restartPm2App(appName: string, cwd: string): void {
  const pm2 = resolve(cwd, "node_modules", "pm2", "bin", "pm2");
  if (!existsSync(pm2)) {
    log.warn({ appName }, "pm2 bin tidak ditemukan — restart dilewati");
    return;
  }
  try {
    const child = spawn(process.execPath, [pm2, "restart", appName, "--update-env"], {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    log.info({ appName }, "PM2 restart dijadwalkan");
  } catch (err) {
    log.warn({ err: (err as Error).message }, "gagal menjadwalkan restart PM2");
  }
}
