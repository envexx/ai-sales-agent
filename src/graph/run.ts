import { HumanMessage } from "@langchain/core/messages";
import { loggerFor } from "../config/logger.js";
import { logConversation, setOptOut, upsertLeadContact } from "../repository/index.js";
import type { InboundTurn } from "../types.js";
import { getGraph } from "./index.js";
import type { SalesStateType } from "./state.js";

const log = loggerFor("graph:run");

/** Klien yang meminta berhenti — jangan pernah dibalas lagi. */
const OPT_OUT_PATTERN =
  /^(stop|berhenti|unsubscribe|jangan (hubungi|kirim|wa)|tolong jangan|hapus nomor)\b/i;

/**
 * Entry point for a single inbound WhatsApp message.
 *
 * Resolves (or creates) the lead, records the inbound message, then runs the
 * graph with `thread_id` so the checkpointer restores prior conversation state.
 */
export async function handleInboundTurn(turn: InboundTurn): Promise<SalesStateType> {
  const lead = await upsertLeadContact({
    waJid: turn.waJid,
    name: turn.contactName ?? null,
  });

  await logConversation({
    leadId: lead.id,
    threadId: turn.threadId,
    role: "user",
    direction: "inbound",
    content: turn.text,
    meta: { messageId: turn.messageId ?? null },
  });

  // Opt-out: tandai lead dan jangan jalankan graph (tidak ada balasan).
  if (OPT_OUT_PATTERN.test(turn.text.trim())) {
    await setOptOut(lead.id);
    log.info({ leadId: lead.id, waJid: turn.waJid }, "lead opted out (STOP)");
    return {
      threadId: turn.threadId,
      leadId: lead.id,
      waJid: turn.waJid,
      contactName: turn.contactName ?? lead.name,
      inboundMessage: turn.text,
      receivedAt: turn.receivedAt ?? new Date().toISOString(),
      messageId: turn.messageId ?? null,
      filtered: true,
      isBot: false,
      finalResponse: "",
      trace: [],
      errors: [],
    } as unknown as SalesStateType;
  }

  const graph = await getGraph();

  const result = (await graph.invoke(
    {
      threadId: turn.threadId,
      leadId: lead.id,
      waJid: turn.waJid,
      contactName: turn.contactName ?? lead.name,
      inboundMessage: turn.text,
      receivedAt: turn.receivedAt ?? new Date().toISOString(),
      messageId: turn.messageId ?? null,
      messages: [new HumanMessage(turn.text)],
      // ── Per-turn reset ──────────────────────────────────────────────
      // These channels use a last-write-wins reducer and are persisted by the
      // Postgres checkpointer. Without resetting them, values leak into the
      // next turn — most importantly `dispatched`, which would stay `true` and
      // make the dispatch node silently skip EVERY reply after the first one.
      triage: null,
      isBot: false,
      filtered: false,
      retrievedContext: [],
      leadScore: 0,
      scoreBreakdown: null,
      segment: null,
      strategy: null,
      draftResponse: "",
      finalResponse: "",
      dispatched: false,
      dispatchMessageId: null,
      booking: null,
      availableSlots: [],
      calBooking: null,
      schedulingNote: "",
      evaluation: null,
      reflection: null,
      memoryWritten: false,
      memoryId: null,
      reflectionLoops: 0,
      reenterForImprovement: false,
      trace: [],
      errors: [],
    },
    {
      configurable: { thread_id: turn.threadId },
      recursionLimit: 50,
    },
  )) as SalesStateType;

  log.info(
    {
      threadId: turn.threadId,
      segment: result.segment,
      score: result.leadScore,
      filtered: result.filtered,
    },
    "turn complete",
  );

  return result;
}
