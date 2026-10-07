import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { logConversation } from "../repository/index.js";
import { getTransport } from "./index.js";

const log = loggerFor("wa:outbound");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Kirim dengan percobaan ulang. `sendText` sudah menunggu koneksi sebentar;
 * bila masih gagal (mis. koneksi barusan putus), kita coba lagi beberapa kali.
 */
async function sendWithRetry(to: string, text: string): Promise<string | null> {
  const attempts = Math.max(1, env.WA_SEND_RETRIES);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const sent = await getTransport().sendText(to, text);
      return sent.id;
    } catch (err) {
      lastError = err;
      log.warn(
        { attempt, attempts, err: (err as Error).message },
        "kirim gagal, akan dicoba lagi",
      );
      if (attempt < attempts) await sleep(env.WA_SEND_RETRY_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("gagal mengirim pesan");
}

export interface SendOutboundParams {
  waJid: string;
  text: string;
  leadId: string | null;
  threadId: string;
}

/**
 * Kirim balasan agent ke WhatsApp dan catat di transkrip.
 *
 * Saat `DRY_RUN=true` pesan tidak benar-benar dikirim, tetapi tetap dicatat
 * sebagai `outbound` agar transkrip konsisten.
 *
 * Dipakai bersama oleh Sales (`dispatch` node) dan agent non-Sales
 * (mis. Research Agent) supaya perilaku pengiriman seragam.
 */
export async function sendOutbound(
  params: SendOutboundParams,
): Promise<{ messageId: string | null }> {
  const text = params.text.trim();
  if (!text) throw new Error("empty outbound text");

  let messageId: string | null = null;
  if (env.DRY_RUN) {
    log.info({ to: params.waJid }, "DRY_RUN active — message not sent");
  } else {
    messageId = await sendWithRetry(params.waJid, text);
  }

  await logConversation({
    leadId: params.leadId,
    threadId: params.threadId,
    role: "assistant",
    direction: "outbound",
    content: text,
    meta: { dryRun: env.DRY_RUN, messageId },
  });

  return { messageId };
}
