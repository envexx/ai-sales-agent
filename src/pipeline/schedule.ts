import { env } from "../config/env.js";
import { enqueueJob } from "./repository.js";

/** Bagian waktu pada zona waktu tertentu + kunci tanggal (YYYY-MM-DD). */
export function tzParts(
  date: Date,
  tz: string,
): { hour: number; minute: number; dateKey: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) parts[part.type] = part.value;
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Waktu berikutnya saat jam `hour` pada zona `tz` tercapai. */
export function nextDailyAt(hour: number, tz: string, from = new Date()): Date {
  const probe = new Date(from.getTime());
  probe.setSeconds(0, 0);
  for (let i = 0; i < 48 * 60; i++) {
    probe.setTime(probe.getTime() + 60_000);
    const p = tzParts(probe, tz);
    if (p.hour === hour && p.minute === 0) return new Date(probe.getTime());
  }
  return new Date(from.getTime() + 24 * 3_600_000);
}

/** Jadwalkan job harian (idempoten per tanggal) pada jam tertentu. */
export async function scheduleDaily(params: {
  type: string;
  hour: number;
  tz?: string;
  dedupePrefix: string;
  payload?: Record<string, unknown>;
}): Promise<string | null> {
  const tz = params.tz ?? env.BRIEFING_TIMEZONE;
  const target = nextDailyAt(params.hour, tz);
  const dateKey = tzParts(target, tz).dateKey;
  return enqueueJob({
    type: params.type,
    runAt: target.toISOString(),
    payload: { ...params.payload, dedupeKey: `${params.dedupePrefix}:${dateKey}` },
  });
}
