import { env } from "../../config/env.js";
import { retrieveKnowledge } from "../../memory/knowledge.js";
import { retrieveMemory } from "../../memory/ltm.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import { formatContext, traceEntry, transcript } from "./helpers.js";

/**
 * Retrieval-Augmented Generation step.
 *
 * Pulls grounding from two sources in parallel:
 *   1. the knowledge base (products, pricing, FAQ, playbooks)
 *   2. long-term memory (reflections/facts from past conversations)
 *
 * The second source is the edge in the diagram "Long-Term Memory ──► RAG":
 * every reflection written at the end of one turn becomes retrievable context
 * for the next one.
 */
export async function ragNode(state: SalesStateType): Promise<SalesUpdateType> {
  const query = [state.inboundMessage, transcript(state.messages, 6)]
    .filter(Boolean)
    .join("\n");

  try {
    const [knowledge, memory] = await Promise.all([
      retrieveKnowledge(query, env.RAG_TOP_K),
      retrieveMemory({ queryText: query, leadId: state.leadId, k: env.LTM_TOP_K }),
    ]);
    const retrievedContext = [...knowledge, ...memory];
    return {
      retrievedContext,
      trace: [
        traceEntry("rag", {
          knowledge: knowledge.length,
          memory: memory.length,
          preview: formatContext(retrievedContext, 2).slice(0, 280),
        }),
      ],
    };
  } catch (err) {
    return {
      retrievedContext: [],
      errors: [`rag: ${(err as Error).message}`],
      trace: [traceEntry("rag", { error: (err as Error).message })],
    };
  }
}
