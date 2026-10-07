import { loggerFor } from "../../config/logger.js";
import { sendOutbound } from "../../whatsapp/outbound.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import { traceEntry } from "./helpers.js";

const log = loggerFor("node:dispatch");

/**
 * Kirim balasan Sales ke WhatsApp.
 *
 * Safety: saat `DRY_RUN=true` pesan tidak dikirim tetapi tetap dicatat. Bila
 * graph masuk kembali lewat reflection loop, dispatch dilewati agar tidak
 * mengirim dua kali.
 */
export async function dispatchNode(state: SalesStateType): Promise<SalesUpdateType> {
  if (state.dispatched) {
    return { trace: [traceEntry("dispatch", { skipped: "already dispatched" })] };
  }

  const text = state.finalResponse?.trim();
  if (!text) {
    return {
      dispatched: false,
      errors: ["dispatch: empty response"],
      trace: [traceEntry("dispatch", { error: "empty response" })],
    };
  }

  try {
    const { messageId } = await sendOutbound({
      waJid: state.waJid,
      text,
      leadId: state.leadId,
      threadId: state.threadId,
    });

    return {
      dispatched: true,
      dispatchMessageId: messageId,
      trace: [traceEntry("dispatch", { dryRun: messageId === null, messageId })],
    };
  } catch (err) {
    log.error({ err: (err as Error).message }, "dispatch failed");
    return {
      dispatched: false,
      errors: [`dispatch: ${(err as Error).message}`],
      trace: [traceEntry("dispatch", { error: (err as Error).message })],
    };
  }
}
