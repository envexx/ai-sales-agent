import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { textInvoke } from "../llm/index.js";
import { businessContext, SHARED_RULES } from "../graph/prompts.js";
import {
  listOutreachCandidates,
  logConversation,
  recordOutreach,
} from "../repository/index.js";
import type { LeadRecord } from "../types.js";
import { getTransport } from "../whatsapp/index.js";

const log = loggerFor("outreach");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Is `now` inside the configured working window (default Mon–Fri 08:00–17:00)? */
export function isWithinWorkingHours(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: env.WORK_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourRaw = Number(parts.find((p) => p.type === "hour")?.value ?? "-1");
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const day = DAY_INDEX[weekday] ?? 0;

  const allowedDays = env.WORK_DAYS.split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7);
  if (allowedDays.length > 0 && !allowedDays.includes(day)) return false;

  return hour >= env.WORK_START_HOUR && hour < env.WORK_END_HOUR;
}

export function workingHoursLabel(): string {
  return `${env.WORK_START_HOUR.toString().padStart(2, "0")}:00–${env.WORK_END_HOUR
    .toString()
    .padStart(2, "0")}:00 ${env.WORK_TIMEZONE} · hari ${env.WORK_DAYS}`;
}

function fallbackMessage(lead: LeadRecord, attempt: number): string {
  const name = lead.name ? ` ${lead.name}` : "";
  if (attempt > 1) {
    return `Selamat pagi${name}, saya Nadia dari ${env.BUSINESS_NAME}. Mohon maaf mengganggu kembali — saya ingin menindaklanjuti pesan saya sebelumnya. Apakah Bapak/Ibu berkenan saya jelaskan singkat? Jika tidak berkenan, cukup balas STOP.`;
  }
  return `Selamat pagi${name}, saya Nadia dari ${env.BUSINESS_NAME}. Kami membantu bisnis yang prosesnya masih manual dengan solusi digital dan automasi. Boleh saya tahu sedikit tantangan operasional yang sedang dihadapi saat ini? Jika tidak berkenan, cukup balas STOP.`;
}

/** Write one outbound message for a prospect (opening or follow-up). */
export async function composeOutreachMessage(
  lead: LeadRecord,
  attempt: number,
): Promise<string> {
  const isFollowUp = attempt > 1;
  try {
    const human = [
      isFollowUp
        ? "Tulis pesan FOLLOW-UP WhatsApp yang singkat dan sopan karena pesan sebelumnya belum dibalas. Jangan menyalahkan atau menekan prospek."
        : "Tulis pesan PEMBUKA WhatsApp pertama ke prospek B2B ini. Perkenalkan diri singkat, sebut alasan menghubungi, lalu ajukan SATU pertanyaan ringan untuk membuka percakapan.",
      `Nama kontak: ${lead.name ?? "(tanpa nama)"}`,
      lead.company ? `Perusahaan: ${lead.company}` : "",
      lead.source ? `Sumber lead: ${lead.source}` : "",
      lead.notes ? `Catatan dari tim sales: ${lead.notes}` : "",
      "Aturan: maksimal ~60 kata, tanpa markdown, maksimal 1 emoji, jangan menyebut harga final, jangan menjanjikan hasil, dan jangan mengaku sudah kenal pribadi.",
      'Wajib diakhiri dengan tepat baris ini: "Jika tidak berkenan, cukup balas STOP."',
      "Balas hanya isi pesannya saja.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const message = await textInvoke({
      system: `${businessContext}\n\n${SHARED_RULES}`,
      human,
      temperature: 0.6,
      maxTokens: 320,
    });
    return message.trim() || fallbackMessage(lead, attempt);
  } catch (err) {
    log.warn({ err: (err as Error).message }, "compose gagal, pakai template fallback");
    return fallbackMessage(lead, attempt);
  }
}

export interface OutreachResult {
  leadId: string;
  name: string | null;
  attempt: number;
  status: "sent" | "failed" | "dry_run";
  message: string;
  error?: string;
}

/** Compose and send (or dry-run) a single outreach message. */
export async function sendOutreach(lead: LeadRecord): Promise<OutreachResult> {
  const attempt = lead.outreachAttempts + 1;
  const kind: "opening" | "follow_up" = attempt > 1 ? "follow_up" : "opening";
  const message = await composeOutreachMessage(lead, attempt);

  const hasMore = attempt + 1 <= env.OUTREACH_MAX_ATTEMPTS;
  const nextStatus = hasMore ? "follow_up" : "done";
  const nextFollowUpAt = hasMore
    ? new Date(Date.now() + env.OUTREACH_FOLLOWUP_HOURS * 3_600_000).toISOString()
    : null;

  let status: OutreachResult["status"] = "sent";
  let error: string | null = null;

  try {
    if (env.DRY_RUN) {
      status = "dry_run";
      log.info({ to: lead.waJid, attempt }, "DRY_RUN — pesan outreach tidak dikirim");
    } else {
      await getTransport().sendText(lead.waJid, message);
    }
  } catch (err) {
    status = "failed";
    error = (err as Error).message;
    log.error({ err: error, leadId: lead.id }, "gagal mengirim outreach");
  }

  await recordOutreach({
    lead,
    attempt,
    kind,
    message,
    status,
    error,
    nextStatus,
    nextFollowUpAt,
  });

  await logConversation({
    leadId: lead.id,
    threadId: `wa:${lead.waJid}`,
    role: "assistant",
    direction: "outbound",
    content: message,
    meta: { outreach: true, attempt, kind, status },
  }).catch(() => {});

  return { leadId: lead.id, name: lead.name, attempt, status, message, error: error ?? undefined };
}

export interface TickResult {
  ran: boolean;
  reason?: string;
  sent: number;
  results: OutreachResult[];
  withinWorkingHours: boolean;
}

let ticking = false;

/** One scheduler pass: send a batch of due outreach messages. */
export async function runOutreachTick(opts: { force?: boolean } = {}): Promise<TickResult> {
  const within = isWithinWorkingHours();

  if (ticking) {
    return { ran: false, reason: "tick sebelumnya masih berjalan", sent: 0, results: [], withinWorkingHours: within };
  }
  if (!env.OUTREACH_ENABLED && !opts.force) {
    return { ran: false, reason: "outreach dinonaktifkan (OUTREACH_ENABLED=false)", sent: 0, results: [], withinWorkingHours: within };
  }
  if (!within && !opts.force) {
    return { ran: false, reason: `di luar jam kerja (${workingHoursLabel()})`, sent: 0, results: [], withinWorkingHours: within };
  }

  ticking = true;
  try {
    const candidates = await listOutreachCandidates({
      limit: env.OUTREACH_BATCH,
      maxAttempts: env.OUTREACH_MAX_ATTEMPTS,
    });

    const results: OutreachResult[] = [];
    for (let i = 0; i < candidates.length; i++) {
      results.push(await sendOutreach(candidates[i]!));
      if (i < candidates.length - 1 && env.OUTREACH_DELAY_MS > 0) {
        await sleep(env.OUTREACH_DELAY_MS);
      }
    }
    if (results.length) {
      log.info({ sent: results.length }, "outreach tick selesai");
    }
    return { ran: true, sent: results.length, results, withinWorkingHours: within };
  } finally {
    ticking = false;
  }
}

let timer: NodeJS.Timeout | null = null;

export function startOutreachScheduler(): void {
  if (!env.OUTREACH_ENABLED) {
    log.info("outreach scheduler tidak aktif (OUTREACH_ENABLED=false)");
    return;
  }
  if (timer) return;
  const everyMs = Math.max(15, env.OUTREACH_TICK_SECONDS) * 1000;
  timer = setInterval(() => {
    void runOutreachTick().catch((err) =>
      log.error({ err: (err as Error).message }, "outreach tick error"),
    );
  }, everyMs);
  log.info({ everySeconds: env.OUTREACH_TICK_SECONDS, hours: workingHoursLabel() }, "outreach scheduler aktif");
}

export function stopOutreachScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
