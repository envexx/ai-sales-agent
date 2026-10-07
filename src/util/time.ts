import { env } from "../config/env.js";

export type DayPart = "pagi" | "siang" | "sore" | "malam";

/** Hour of day (0–23) in a specific timezone. */
function hourIn(now: Date, timeZone: string): number {
  const raw = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return raw === 24 ? 0 : raw;
}

/**
 * Indonesian part of day.
 *   pagi  03:00–10:59 · siang 11:00–14:59 · sore 15:00–17:59 · malam 18:00–02:59
 */
export function dayPart(
  now: Date = new Date(),
  timeZone: string = env.WORK_TIMEZONE,
): DayPart {
  const h = hourIn(now, timeZone);
  if (h >= 3 && h < 11) return "pagi";
  if (h >= 11 && h < 15) return "siang";
  if (h >= 15 && h < 18) return "sore";
  return "malam";
}

/** e.g. "Senin, 5 Oktober 2026 pukul 12.53" */
export function localTimeLabel(
  now: Date = new Date(),
  timeZone: string = env.WORK_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

/** Format ISO date `YYYY-MM-DD` pada zona waktu tertentu (untuk cek hari). */
export function todayKey(
  now: Date = new Date(),
  timeZone: string = env.WORK_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const GREETING_RE =
  /^\s*(selamat\s+(pagi|siang|sore|malam)|halo|hai|hi|assalamu'?alaikum|salam)\b/i;

/** Apakah teks diawali sapaan (Selamat pagi/siang/sore/malam, Halo, dst). */
export function startsWithGreeting(text: string): boolean {
  return GREETING_RE.test(text.trim());
}
export function timeGreetingContext(
  now: Date = new Date(),
  timeZone: string = env.WORK_TIMEZONE,
): string {
  const part = dayPart(now, timeZone);
  return [
    `Waktu saat ini: ${localTimeLabel(now, timeZone)} (zona ${timeZone}).`,
    `Sapaan waktu yang benar sekarang: "Selamat ${part}".`,
    `Jangan memakai sapaan waktu lain (mis. jangan bilang "pagi" bila sekarang siang/sore/malam).`,
  ].join(" ");
}
