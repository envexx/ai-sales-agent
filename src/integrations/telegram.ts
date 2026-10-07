import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("integration:telegram");
const API = "https://api.telegram.org";

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; title?: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from?: { id: number; first_name?: string; username?: string };
    message?: { message_id: number; chat: { id: number; type: string } };
    data?: string;
  };
}

/** Opsi umum: pakai token bot tertentu (default: TELEGRAM_BOT_TOKEN). */
export interface TelegramOptions {
  botToken?: string;
  /** Batasi jenis update (mis. ["message","callback_query"]). */
  allowedUpdates?: string[];
}

function tokenOf(opts?: TelegramOptions): string {
  return opts?.botToken ?? env.TELEGRAM_BOT_TOKEN;
}

function endpoint(method: string, opts?: TelegramOptions): string {
  return `${API}/bot${tokenOf(opts)}/${method}`;
}

/** Long polling getUpdates. `timeoutSec` = lama Telegram menahan koneksi. */
export async function getTelegramUpdates(
  offset: number,
  timeoutSec = 30,
  opts?: TelegramOptions,
): Promise<TelegramUpdate[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (timeoutSec + 12) * 1000);
  try {
    const allowed = opts?.allowedUpdates ?? ["message"];
    const url =
      `${endpoint("getUpdates", opts)}?offset=${offset}&timeout=${timeoutSec}` +
      `&allowed_updates=${encodeURIComponent(JSON.stringify(allowed))}`;
    const res = await fetch(url, { signal: controller.signal });
    const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
    if (!data.ok) {
      log.warn({ data }, "getUpdates tidak ok");
      return [];
    }
    return data.result ?? [];
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      log.warn({ err: (err as Error).message }, "getUpdates error");
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Kirim pesan teks. Bisa menyertakan tombol inline (reply_markup). */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  opts?: TelegramOptions & { replyMarkup?: Record<string, unknown> },
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    };
    if (opts?.replyMarkup) body.reply_markup = opts.replyMarkup;
    const res = await fetch(endpoint("sendMessage", opts), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) log.warn({ description: data.description }, "sendMessage gagal");
    return data.ok;
  } catch (err) {
    log.warn({ err: (err as Error).message }, "sendMessage error");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Jawab callback tombol inline (agar tombol berhenti "loading"). */
export async function answerTelegramCallback(
  callbackQueryId: string,
  text?: string,
  opts?: TelegramOptions,
): Promise<void> {
  try {
    await fetch(endpoint("answerCallbackQuery", opts), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text ?? "" }),
    });
  } catch (err) {
    log.warn({ err: (err as Error).message }, "answerCallbackQuery error");
  }
}

export async function getTelegramMe(
  opts?: TelegramOptions,
): Promise<{ ok: boolean; username?: string }> {
  try {
    const res = await fetch(endpoint("getMe", opts));
    const data = (await res.json()) as { ok: boolean; result?: { username?: string } };
    return { ok: data.ok, username: data.result?.username };
  } catch {
    return { ok: false };
  }
}
