import { END, START, StateGraph, type CompiledStateGraph } from "@langchain/langgraph";
import type { AgentName } from "./agents.js";
import { SupervisorState, type SupervisorStateType } from "./state.js";
import { supervisorNode } from "./nodes/supervisor.js";
import { salesAgentNode } from "./nodes/sales.js";
import { prospectingAgentNode } from "./nodes/prospecting.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupervisorGraph = CompiledStateGraph<any, any, any, any, any, any, any>;

/** Supervisor memilih agent; hasilnya menentukan cabang node berikutnya. */
function routeToAgent(state: SupervisorStateType): AgentName {
  return state.activeAgent ?? "sales";
}

/**
 * Graph supervisor (orchestrator).
 *
 *   START → supervisor ─┬─ sales → END
 *                       └─ (agent lain menyusul) → END
 *
 * Dibangun tanpa checkpointer: supervisor hanya memilih agent untuk turn ini,
 * sedangkan memori percakapan disimpan oleh masing-masing agent.
 */
export function createSupervisorGraph() {
  return new StateGraph(SupervisorState)
    .addNode("supervisor", supervisorNode)
    .addNode("sales", salesAgentNode)
    .addNode("prospecting", prospectingAgentNode)
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", routeToAgent, {
      sales: "sales",
      prospecting: "prospecting",
    })
    .addEdge("sales", END)
    .addEdge("prospecting", END)
    .compile();
}

let cached: SupervisorGraph | null = null;

/** Compile sekali dan pakai ulang. */
export function getSupervisorGraph(): SupervisorGraph {
  if (!cached) cached = createSupervisorGraph() as unknown as SupervisorGraph;
  return cached;
}

/** Diagram arsitektur supervisor untuk docs/UI. */
export const SUPERVISOR_MERMAID = `flowchart TD
    inbound["WhatsApp / API Turn"] --> supervisor["Supervisor Agent"]
    supervisor -->|"sales"| sales["Sales Agent (Nadia)"]
    supervisor -->|"prospecting"| prospecting["Research Prospecting (Maps)"]
    sales --> reply["Reply dispatched"]
    prospecting --> leads["Prospects → leads (outreach queue)"]`;
