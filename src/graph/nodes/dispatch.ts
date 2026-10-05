import { env } from "../../config/env.js";
import { loggerFor } from "../../config/logger.js";
import { logConversation } from "../../repository/index.js";
import { getTransport } from "../../whatsapp/index.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import { traceEntry } from "./helpers.js";

const log = loggerFor("node:dispatch");

/**
 * Send the generated reply over WhatsApp.
 *
 * Safety: when DRY_RUN=true nothing is actually sent, but the outbound message
 * is still recorded so the transcript stays coherent. If the graph re-enters
 * through the reflection loop, dispatch is skipped to avoid double-sending.
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
    let messageId: string | null = null;

    if (env.DRY_RUN) {
      log.info({ to: state.waJid }, "DRY_RUN active — message not sent");
    } else {
      const transport = getTransport();
      const sent = await transport.sendText(state.waJid, text);
      messageId = sent.id;
    }

    await logConversation({
      leadId: state.leadId,
      threadId: state.threadId,
      role: "assistant",
      direction: "outbound",
      content: text,
      meta: { dryRun: env.DRY_RUN, messageId },
    });

    return {
      dispatched: true,
      dispatchMessageId: messageId,
      trace: [traceEntry("dispatch", { dryRun: env.DRY_RUN, messageId })],
    };
  } catch (err) {
    return {
      dispatched: false,
      errors: [`dispatch: ${(err as Error).message}`],
      trace: [traceEntry("dispatch", { error: (err as Error).message })],
    };
  }
}
