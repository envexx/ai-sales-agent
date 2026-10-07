import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { getTelegramMe, getTelegramUpdates, sendTelegramMessage, type TelegramUpdate } from "../integrations/telegram.js";
import { getChannel } from "../pipeline/entities.js";
import { runSupport } from "./run.js";

const log = loggerFor("support:telegram");

let running = false;
let offset = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function telegramEnabled(): boolean {
  return env.TELEGRAM_ENABLED && Boolean(env.TELEGRAM_BOT_TOKEN);
}

/** Mulai long-polling Telegram (dipanggil saat boot). */
export function startTelegramBot(): void {
  if (!telegramEnabled()) {
    log.info(
      {
        enabled: env.TELEGRAM_ENABLED,
        hasToken: Boolean(env.TELEGRAM_BOT_TOKEN),
      },
      "telegram bot (kanal klien) nonaktif",
    );
    return;
  }
  running = true;
  void getTelegramMe().then((me) =>
    log.info({ username: me.username, ok: me.ok }, "telegram bot aktif"),
  );
  void loop();
}

export function stopTelegramBot(): void {
  running = false;
}

async function loop(): Promise<void> {
  while (running) {
    const updates = await getTelegramUpdates(offset, 30);
    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
      try {
        await handleUpdate(update);
      } catch (err) {
        log.error({ err: (err as Error).message }, "handleUpdate gagal");
      }
    }
    if (running && updates.length === 0) await sleep(500);
  }
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  const text = msg?.text?.trim();
  const chatId = msg?.chat?.id;
  if (chatId === undefined || !text) return;

  if (text.startsWith("/start")) {
    await sendTelegramMessage(chatId, "Halo! Kanal ini untuk dukungan. Silakan sebutkan kendala Anda.");
    return;
  }

  const mapped = await getChannel("telegram", String(chatId));
  if (!mapped?.projectId) {
    await sendTelegramMessage(
      chatId,
      `Kanal ini (chat id ${chatId}) belum terhubung ke proyek. Minta admin menjalankan:\nLINK ${chatId} <projectId>`,
    );
    log.warn({ chatId }, "pesan dari kanal belum terhubung ke proyek");
    return;
  }

  const result = await runSupport({
    message: text,
    channel: "telegram",
    projectId: mapped.projectId,
    clientId: mapped.clientId,
  });
  await sendTelegramMessage(chatId, result.reply);
}
