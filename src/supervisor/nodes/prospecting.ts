import { env } from "../../config/env.js";
import { loggerFor } from "../../config/logger.js";
import { traceEntry } from "../../graph/nodes/helpers.js";
import { enqueueJob } from "../../pipeline/repository.js";
import { sendOutbound } from "../../whatsapp/outbound.js";
import type { SupervisorStateType, SupervisorUpdateType } from "../state.js";

const log = loggerFor("supervisor:prospecting");

/** Pola perintah chat: "cari prospek <niche> di <kota>". */
const PROSPECT_PATTERN =
  /(?:cari\s+)?(?:prospek|prospecting|klien|bisnis)\s+(.+?)\s+di\s+(.+)/i;

async function respond(
  state: SupervisorStateType,
  reply: string,
  metadata: Record<string, unknown>,
  errors: string[] = [],
): Promise<SupervisorUpdateType> {
  let dispatched = false;
  let messageId: string | null = null;
  const sendErrors: string[] = [];
  try {
    const sent = await sendOutbound({
      waJid: state.waJid,
      text: reply,
      leadId: state.leadId,
      threadId: state.threadId,
    });
    messageId = sent.messageId;
    dispatched = true;
  } catch (err) {
    sendErrors.push(`agent:prospecting dispatch: ${(err as Error).message}`);
    log.error({ err: (err as Error).message }, "prospecting dispatch failed");
  }

  const allErrors = [...errors, ...sendErrors];
  return {
    reply,
    filtered: false,
    agentResult: { agent: "prospecting", reply, metadata: { ...metadata, dispatched, messageId } },
    ...(allErrors.length ? { errors: allErrors } : {}),
    trace: [traceEntry("agent:prospecting", { ...metadata, dispatched })],
  };
}

/**
 * Worker adapter untuk Research Prospecting.
 *
 * Untuk chat, pekerjaan yang berat (scrape Maps + enrichment) tidak dijalankan
 * sinkron; ia **dijadwalkan** sebagai job `prospecting.scan`. Hasilnya dikirim
 * ke owner saat selesai. Untuk pemakaian programatik, gunakan `POST /prospecting`.
 */
export async function prospectingAgentNode(
  state: SupervisorStateType,
): Promise<SupervisorUpdateType> {
  if (!env.PROSPECTING_ENABLED) {
    return respond(state, "Fitur prospecting sedang nonaktif.", { disabled: true });
  }

  const match = state.inboundMessage.trim().match(PROSPECT_PATTERN);
  if (!match?.[1] || !match[2]) {
    return respond(
      state,
      "Untuk memulai prospecting, tulis: *cari prospek <jenis bisnis> di <kota>*.\nContoh: _cari prospek klinik kecantikan di Bandung_",
      { parsed: false },
    );
  }

  const niche = match[1].trim();
  const location = match[2].trim();

  try {
    const jobId = await enqueueJob({
      type: "prospecting.scan",
      payload: { niche, location },
      priority: 1,
    });
    log.info({ niche, location, jobId }, "prospecting dijadwalkan dari chat");
    return respond(
      state,
      `🔎 Prospecting dijadwalkan: *${niche}* di *${location}*.\nHasil akan dikirim otomatis setelah selesai.`,
      { niche, location, jobId, queued: true },
    );
  } catch (err) {
    return respond(
      state,
      "Maaf, gagal menjadwalkan prospecting. Coba lagi sebentar.",
      { error: true },
      [`agent:prospecting: ${(err as Error).message}`],
    );
  }
}
