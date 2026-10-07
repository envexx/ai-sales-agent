import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { sendTelegramMessage } from "../integrations/telegram.js";
import { sendOutbound } from "../whatsapp/outbound.js";

const log = loggerFor("notifications");

export interface NotifyResult {
  sent: boolean;
  reason?: string;
}

/**
 * Kirim notifikasi ke owner via kanal yang tersedia: WhatsApp (bila
 * `OWNER_WA_JID` diisi) dan/atau **Telegram** (bila `TELEGRAM_BOT_TOKEN` +
 * `TELEGRAM_OWNER_CHAT_ID` diisi). Dipakai Supervisor untuk Daily Briefing,
 * alert, dan permintaan persetujuan. Bila tidak ada kanal, notifikasi dilewati.
 */
export async function notifyOwner(params: {
  title: string;
  body: string;
}): Promise<NotifyResult> {
  if (!env.NOTIFY_ENABLED) return { sent: false, reason: "NOTIFY_ENABLED=false" };

  const channels: string[] = [];
  let sent = false;

  // WhatsApp (bila nomor owner diisi).
  if (env.OWNER_WA_JID) {
    try {
      await sendOutbound({
        waJid: env.OWNER_WA_JID,
        text: `*${params.title}*\n\n${params.body}`,
        leadId: null,
        threadId: `owner:${env.OWNER_WA_JID}`,
      });
      sent = true;
      channels.push("whatsapp");
    } catch (err) {
      log.error({ err: (err as Error).message }, "notifikasi WhatsApp gagal");
    }
  }

  // Telegram (kanal utama laporan Supervisor/briefing).
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_OWNER_CHAT_ID) {
    try {
      const ok = await sendTelegramMessage(
        env.TELEGRAM_OWNER_CHAT_ID,
        `${params.title}\n\n${params.body}`,
      );
      if (ok) {
        sent = true;
        channels.push("telegram");
      }
    } catch (err) {
      log.error({ err: (err as Error).message }, "notifikasi Telegram gagal");
    }
  }

  if (sent) return { sent: true };
  return {
    sent: false,
    reason: channels.length
      ? "semua kanal gagal"
      : "tidak ada kanal notifikasi (OWNER_WA_JID / TELEGRAM_OWNER_CHAT_ID kosong)",
  };
}

/** true bila nomor pengirim adalah owner. */
export function isOwner(waJid: string): boolean {
  return Boolean(env.OWNER_WA_JID) && waJid === env.OWNER_WA_JID;
}
