import { END } from "@langchain/langgraph";
import type { SalesStateType } from "./state.js";

/** BOT → FILTER, HUMAN → RAG. */
export function routeAfterTriage(state: SalesStateType): "filter" | "rag" {
  return state.isBot ? "filter" : "rag";
}

/** Score band → strategy branch. */
export function routeBySegment(
  state: SalesStateType,
): "nurture" | "objection" | "closing" {
  return state.segment ?? "nurture";
}

/** Long-Term Memory → RAG feedback edge, bounded by MAX_REFLECTION_LOOPS. */
export function routeAfterMemory(state: SalesStateType): "rag" | typeof END {
  return state.reenterForImprovement ? "rag" : END;
}
