import type { JobHandler } from "./types.js";

/**
 * Registry handler job. Setiap tipe job dipetakan ke satu fungsi.
 *
 * Menambah pekerjaan terjadwal = `registerJobHandler("tipe", fn)` lalu
 * enqueue job dengan tipe tersebut.
 */
const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getJobHandler(type: string): JobHandler | undefined {
  return handlers.get(type);
}

export function registeredJobTypes(): string[] {
  return [...handlers.keys()].sort();
}
