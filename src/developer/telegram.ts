import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import {
  answerTelegramCallback,
  getTelegramMe,
  getTelegramUpdates,
  sendTelegramMessage,
  type TelegramUpdate,
} from "../integrations/telegram.js";
import type { ApprovalRecord } from "../pipeline/types.js";

const log = loggerFor("developer:telegram");

/**
 * Bot Telegram khusus agent **Developer** — mengirim permintaan persetujuan
 * eksekusi (push/PR & deploy) ke owner via bot terpisah, lengkap dengan tombol
 * **Setujui / Tolak**. Owner "tinggal chat lewat Telegram".
 *
 * Butuh: `DEVELOPER_TELEGRAM_BOT_TOKEN` + `DEVELOPER_TELEGRAM_CHAT_ID`.
 */

const shortId = (id: string): string => id.slice(0, 8).toUpperCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let running = false;
let offset = 0;

export function developerTelegramEnabled(): boolean {
  return Boolean(env.DEVELOPER_TELEGRAM_BOT_TOKEN && env.DEVELOPER_TELEGRAM_CHAT_ID);
}

/** Kirim permintaan persetujuan Developer ke owner (dengan tombol inline). */
export async function notifyDeveloperApproval(approval: ApprovalRecord): Promise<boolean> {
  if (!developerTelegramEnabled()) return false;
  const id = shortId(approval.id);
  const lines = [
    `🤖 *Developer — butuh persetujuan*`,
    "",
    approval.title,
    approval.summary ? `\n${approval.summary}` : "",
    "",
    `ID: ${id}`,
    `Balas: \`APPROVE ${id}\` / \`REJECT ${id}\``,
  ].filter(Boolean);

  return sendTelegramMessage(env.DEVELOPER_TELEGRAM_CHAT_ID, lines.join("\n"), {
    botToken: env.DEVELOPER_TELEGRAM_BOT_TOKEN,
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "✅ Setujui", callback_data: `dev:approve:${id}` },
          { text: "❌ Tolak", callback_data: `dev:reject:${id}` },
        ],
      ],
    },
  });
}

/** Mulai long-polling bot Developer (dipanggil saat boot). */
export function startDeveloperTelegramBot(): void {
  if (!developerTelegramEnabled()) {
    log.info(
      { hasToken: Boolean(env.DEVELOPER_TELEGRAM_BOT_TOKEN) },
      "bot Developer nonaktif (token/chat id belum diisi)",
    );
    return;
  }
  running = true;
  void getTelegramMe({ botToken: env.DEVELOPER_TELEGRAM_BOT_TOKEN }).then((me) =>
    log.info({ username: me.username, ok: me.ok }, "bot Developer aktif"),
  );
  void loop();
}

export function stopDeveloperTelegramBot(): void {
  running = false;
}

async function loop(): Promise<void> {
  while (running) {
    const updates = await getTelegramUpdates(offset, 30, {
      botToken: env.DEVELOPER_TELEGRAM_BOT_TOKEN,
      allowedUpdates: ["message", "callback_query"],
    });
    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
      try {
        await handleUpdate(update);
      } catch (err) {
        log.error({ err: (err as Error).message }, "handleUpdate developer gagal");
      }
    }
    if (running && updates.length === 0) await sleep(500);
  }
}

/** Hanya layani chat owner yang dikonfigurasi. */
function isOwnerChat(chatId: number | undefined): boolean {
  return chatId !== undefined && String(chatId) === String(env.DEVELOPER_TELEGRAM_CHAT_ID);
}

async function decide(id: string, decision: "approved" | "rejected"): Promise<string> {
  const { decideByPrefix } = await import("../pipeline/approvals.js");
  const updated = await decideByPrefix(id, decision, "owner-telegram");
  if (!updated) return `Approval ${id} tidak ditemukan / sudah diputuskan.`;
  return `${decision === "approved" ? "✅ Disetujui" : "❌ Ditolak"}: ${updated.title}`;
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const token = env.DEVELOPER_TELEGRAM_BOT_TOKEN;

  // Tombol inline.
  const cb = update.callback_query;
  if (cb) {
    if (!isOwnerChat(cb.message?.chat?.id)) return;
    const match = (cb.data ?? "").match(/^dev:(approve|reject):([A-Za-z0-9]+)$/);
    if (!match) {
      await answerTelegramCallback(cb.id, "Abaikan.", { botToken: token });
      return;
    }
    const decision = match[1] === "approve" ? "approved" : "rejected";
    const reply = await decide(match[2]!, decision);
    await answerTelegramCallback(cb.id, decision === "approved" ? "Disetujui" : "Ditolak", {
      botToken: token,
    });
    await sendTelegramMessage(env.DEVELOPER_TELEGRAM_CHAT_ID, reply, { botToken: token });
    return;
  }

  // Pesan teks: APPROVE/REJECT <id>.
  const msg = update.message;
  if (msg?.chat?.id !== undefined && !isOwnerChat(msg.chat.id)) {
    log.info(
      { chatId: msg.chat.id, text: msg.text?.slice(0, 40) },
      "pesan dari chat tak dikenal (bukan DEVELOPER_TELEGRAM_CHAT_ID)",
    );
    return;
  }
  if (!isOwnerChat(msg?.chat?.id)) return;
  const text = msg?.text?.trim();
  if (!text) return;
  const m = text.match(/^(approve|reject|acc|tolak)\s+([A-Za-z0-9-]+)/i);
  if (m) {
    const decision = m[1]!.toLowerCase().startsWith("a") ? "approved" : "rejected";
    const reply = await decide(m[2]!, decision);
    await sendTelegramMessage(env.DEVELOPER_TELEGRAM_CHAT_ID, reply, { botToken: token });
    return;
  }
  if (text.startsWith("/start")) {
    await sendTelegramMessage(
      env.DEVELOPER_TELEGRAM_CHAT_ID,
      "Bot Developer aktif. Anda akan menerima permintaan persetujuan eksekusi di sini.",
      { botToken: token },
    );
  }
}
