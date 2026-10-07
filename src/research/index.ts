import { END, START, StateGraph, type CompiledStateGraph } from "@langchain/langgraph";
import { getCheckpointer } from "../graph/checkpointer.js";
import { ResearchState, type ResearchStateType } from "./state.js";
import { plannerNode } from "./nodes/planner.js";
import { ingestNode } from "./nodes/ingest.js";
import { extractNode } from "./nodes/extract.js";
import { verifyNode } from "./nodes/verify.js";
import { formatNode } from "./nodes/format.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResearchGraph = CompiledStateGraph<any, any, any, any, any, any, any>;

/**
 * Keputusan loop setelah evaluator:
 * ulangi planner bila masih dangkal/ada gap, selain itu lanjut ke formatter.
 */
export function routeAfterVerify(
  state: ResearchStateType,
): "planner" | "formatter" {
  const brief = state.brief;
  if (!brief) return "formatter";

  const tooManyIterations = state.iteration >= brief.maxIterations;
  const enoughSources = state.sources.length >= brief.maxSources;
  const deepEnough = state.depth >= brief.depth;
  const noGaps = state.gaps.length === 0;

  if (state.satisfied || tooManyIterations || enoughSources || deepEnough || noGaps) {
    return "formatter";
  }
  return "planner";
}

/**
 * Universal Research Engine (LangGraph reusable core).
 *
 *   START → planner → ingest → extract → verify ─┬─(perlu data)→ planner
 *                                                └─(cukup/cap)→ formatter → END
 */
export function createResearchGraph(
  checkpointer?: Awaited<ReturnType<typeof getCheckpointer>>,
) {
  const builder = new StateGraph(ResearchState)
    .addNode("planner", plannerNode)
    .addNode("ingest", ingestNode)
    .addNode("extract", extractNode)
    .addNode("verify", verifyNode)
    .addNode("formatter", formatNode)
    .addEdge(START, "planner")
    .addEdge("planner", "ingest")
    .addEdge("ingest", "extract")
    .addEdge("extract", "verify")
    .addConditionalEdges("verify", routeAfterVerify, {
      planner: "planner",
      formatter: "formatter",
    })
    .addEdge("formatter", END);

  return builder.compile(checkpointer ? { checkpointer } : {});
}

let cached: ResearchGraph | null = null;

/**
 * Compile sekali dan pakai ulang. Memakai checkpointer bersama, tetapi setiap
 * run memakai `thread_id` unik (`research:<reportId>`) sehingga tidak bentrok
 * dengan percakapan sales.
 */
export async function getResearchGraph(): Promise<ResearchGraph> {
  if (cached) return cached;
  const checkpointer = await getCheckpointer();
  cached = createResearchGraph(checkpointer) as unknown as ResearchGraph;
  return cached;
}

/** Diagram arsitektur engine untuk docs/UI. */
export const RESEARCH_MERMAID = `flowchart TD
    brief["Research Brief Config"] --> planner["1. Parameterized Planner"]
    planner --> ingest["2. Dual-Engine Ingestion (Firecrawl + Camoufox)"]
    ingest --> extract["3. Context Pruning & Fact Extraction"]
    extract --> verify["4. Strict Gap/Depth Evaluator"]
    verify -->|"depth < max & perlu data"| planner
    verify -->|"selesai / cap limit"| formatter["5. Schema-Driven Formatter"]
    formatter --> output["Laporan Sesuai Format Brief"]`;
