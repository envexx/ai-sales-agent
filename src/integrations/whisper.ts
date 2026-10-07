import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("integration:whisper");

/** Jalankan proses python dan tangkap stdout (maks `timeoutMs`). */
function runPython(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(env.WHISPER_PYTHON, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`whisper timeout setelah ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`whisper exit ${code}: ${stderr.trim().slice(-300)}`));
        return;
      }
      resolvePromise(stdout.trim());
    });
  });
}

/**
 * Transkripsi voice note menjadi teks (lokal, faster-whisper).
 * Mengembalikan "" bila dinonaktifkan atau gagal (pemanggil memutuskan fallback).
 */
export async function transcribeAudio(buffer: Buffer, ext = "ogg"): Promise<string> {
  if (!env.WHISPER_ENABLED) return "";

  const dir = await mkdtemp(join(tmpdir(), "wa-voice-"));
  const file = join(dir, `audio.${ext}`);
  await writeFile(file, buffer);

  try {
    const script = resolve(process.cwd(), "scripts", "whisper_transcribe.py");
    const out = await runPython(
      [script, file, env.WHISPER_MODEL, env.WHISPER_LANGUAGE],
      env.WHISPER_TIMEOUT_MS,
    );
    const lastLine = out.split(/\r?\n/).filter(Boolean).pop() ?? "{}";
    const parsed = JSON.parse(lastLine) as { text?: string; error?: string };
    if (parsed.error) {
      log.warn({ err: parsed.error }, "whisper gagal");
      return "";
    }
    return (parsed.text ?? "").trim();
  } catch (err) {
    log.warn({ err: (err as Error).message }, "whisper error");
    return "";
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
