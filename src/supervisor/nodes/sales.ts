import { traceEntry } from "../../graph/nodes/helpers.js";
import { runSalesAgent } from "../../graph/run.js";
import type { SupervisorStateType, SupervisorUpdateType } from "../state.js";

/**
 * Worker adapter untuk Sales Agent.
 *
 * Node ini TIDAK melakukan logging atau upsert lead — itu sudah dikerjakan
 * bersama di `prepareInboundTurn` sebelum supervisor berjalan. Di sini hanya
 * memanggil graph Sales lalu meringkas hasilnya untuk supervisor.
 */
export async function salesAgentNode(
  state: SupervisorStateType,
): Promise<SupervisorUpdateType> {
  try {
    const result = await runSalesAgent({
      threadId: state.threadId,
      leadId: state.leadId,
      waJid: state.waJid,
      contactName: state.contactName,
      text: state.inboundMessage,
      messageId: state.messageId,
      receivedAt: state.receivedAt,
    });

    return {
      reply: result.finalResponse,
      filtered: result.filtered,
      agentResult: {
        agent: "sales",
        reply: result.finalResponse,
        metadata: {
          leadId: result.leadId,
          isBot: result.isBot,
          intent: result.triage?.intent ?? null,
          leadScore: result.leadScore,
          segment: result.segment,
          dispatched: result.dispatched,
          rag: {
            knowledge: result.retrievedContext.filter((d) => d.source === "knowledge")
              .length,
            memory: result.retrievedContext.filter((d) => d.source === "memory").length,
            scout: result.retrievedContext.filter((d) => d.source === "scout").length,
          },
          evaluation: result.evaluation,
          booking: result.booking,
        },
      },
      errors: result.errors,
      trace: [
        traceEntry("agent:sales", {
          segment: result.segment,
          score: result.leadScore,
          dispatched: result.dispatched,
        }),
      ],
    };
  } catch (err) {
    return {
      reply: "",
      filtered: false,
      errors: [`agent:sales: ${(err as Error).message}`],
      trace: [traceEntry("agent:sales", { error: (err as Error).message })],
    };
  }
}
