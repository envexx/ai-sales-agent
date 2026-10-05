import { END, START, StateGraph, type CompiledStateGraph } from "@langchain/langgraph";
import { SalesState } from "./state.js";
import { getCheckpointer } from "./checkpointer.js";
import { routeAfterMemory, routeAfterTriage, routeBySegment } from "./edges.js";

import { triageNode } from "./nodes/triage.js";
import { filterNode } from "./nodes/filter.js";
import { ragNode } from "./nodes/rag.js";
import { leadScoringNode } from "./nodes/leadScoring.js";
import { closingNode, nurtureNode, objectionNode } from "./nodes/strategies.js";
import { schedulingNode } from "./nodes/scheduling.js";
import { responseGenerationNode } from "./nodes/responseGeneration.js";
import { dispatchNode } from "./nodes/dispatch.js";
import { bookingNode } from "./nodes/booking.js";
import { evaluationNode } from "./nodes/evaluation.js";
import { reflectionNode } from "./nodes/reflection.js";
import { longTermMemoryNode } from "./nodes/longTermMemory.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SalesGraph = CompiledStateGraph<any, any, any, any, any, any, any>;

/**
 * Builds the sales automation state machine.
 *
 *   WhatsApp Webhook
 *     → AI Triage / Bot Detection
 *         ├─ BOT   → Filter
 *         └─ HUMAN → RAG → Lead Scoring
 *                      ├─ <40    → Nurture
 *                      ├─ 40–74  → Objection
 *                      └─ >=75   → Closing
 *                            → Response Generation
 *                            → WhatsApp Dispatch
 *                            → Booking / Follow-up
 *                            → Evaluation / Critique
 *                            → Reflection Engine
 *                            → Long-Term Memory ──► RAG (feedback edge)
 *
 * Extra node: `scheduling` (Cal.com MCP) runs after the strategy branch and
 * before Response Generation, so the reply can offer real availability or
 * confirm a booking that was just created.
 */
export function createGraph(checkpointer?: Awaited<ReturnType<typeof getCheckpointer>>) {
  // NOTE: LangGraph v1 forbids a node name that collides with a state
  // channel, so `triage`, `booking`, `evaluation` and `reflection` nodes are
  // named with a suffix while the state fields keep their semantic names.
  const builder = new StateGraph(SalesState)
    .addNode("triageMessage", triageNode)
    .addNode("filter", filterNode)
    .addNode("rag", ragNode)
    .addNode("leadScoring", leadScoringNode)
    .addNode("nurture", nurtureNode)
    .addNode("objection", objectionNode)
    .addNode("closing", closingNode)
    .addNode("scheduling", schedulingNode)
    .addNode("responseGeneration", responseGenerationNode)
    .addNode("dispatch", dispatchNode)
    .addNode("bookingFlow", bookingNode)
    .addNode("critique", evaluationNode)
    .addNode("reflect", reflectionNode)
    .addNode("longTermMemory", longTermMemoryNode)
    .addEdge(START, "triageMessage")
    .addConditionalEdges("triageMessage", routeAfterTriage, {
      filter: "filter",
      rag: "rag",
    })
    .addEdge("filter", END)
    .addEdge("rag", "leadScoring")
    .addConditionalEdges("leadScoring", routeBySegment, {
      nurture: "nurture",
      objection: "objection",
      closing: "closing",
    })
    .addEdge("nurture", "scheduling")
    .addEdge("objection", "scheduling")
    .addEdge("closing", "scheduling")
    .addEdge("scheduling", "responseGeneration")
    .addEdge("responseGeneration", "dispatch")
    .addEdge("dispatch", "bookingFlow")
    .addEdge("bookingFlow", "critique")
    .addEdge("critique", "reflect")
    .addEdge("reflect", "longTermMemory")
    .addConditionalEdges("longTermMemory", routeAfterMemory, {
      rag: "rag",
      [END]: END,
    });

  return builder.compile(checkpointer ? { checkpointer } : {});
}

let cached: SalesGraph | null = null;

/** Compile once and reuse. Requires the checkpointer (i.e. a live Postgres). */
export async function getGraph(): Promise<SalesGraph> {
  if (cached) return cached;
  const checkpointer = await getCheckpointer();
  cached = createGraph(checkpointer) as unknown as SalesGraph;
  return cached;
}

/** A static Mermaid rendering of the architecture, for docs/UI. */
export const GRAPH_MERMAID = `flowchart TD
    webhook["WhatsApp Webhook"] --> triage["AI Triage / Bot Detection"]
    triage -->|BOT| filter["Filter"]
    triage -->|HUMAN| rag["RAG"]
    rag --> scoring["Lead Scoring"]
    scoring -->|"< 40"| nurture["Nurture"]
    scoring -->|"40-74"| objection["Objection"]
    scoring -->|">= 75"| closing["Closing"]
    nurture --> scheduling["Scheduling (Cal.com MCP)"]
    objection --> scheduling
    closing --> scheduling
    scheduling --> response["Response Generation"]
    response --> dispatch["WhatsApp Dispatch"]
    dispatch --> booking["Booking / Follow-up"]
    booking --> evaluation["Evaluation / Critique"]
    evaluation --> reflection["Reflection Engine"]
    reflection --> ltm["Long-Term Memory"]
    ltm -->|feedback| rag`;
