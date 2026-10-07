import { Annotation } from "@langchain/langgraph";
import type { TraceEntry } from "../types.js";
import type { AgentName, AgentResult } from "./agents.js";

/** Last write wins. Generic eksplisit di call site menjaga tipe `Update`. */
const last = <T,>(def: T) => ({
  reducer: (_prev: T, next: T): T => next,
  default: (): T => def,
});

/**
 * State supervisor.
 *
 * Supervisor sengaja *stateless* (tanpa checkpointer): ia hanya memilih agent
 * untuk turn saat ini. Memori percakapan tetap dimiliki tiap agent — graph
 * Sales sudah menyimpannya per `thread_id`.
 */
export const SupervisorState = Annotation.Root({
  /* identitas turn (mirror `InboundTurn`) */
  threadId: Annotation<string>(last<string>("")),
  leadId: Annotation<string>(last<string>("")),
  waJid: Annotation<string>(last<string>("")),
  contactName: Annotation<string | null>(last<string | null>(null)),
  inboundMessage: Annotation<string>(last<string>("")),
  receivedAt: Annotation<string>(last<string>("")),
  messageId: Annotation<string | null>(last<string | null>(null)),

  /* keputusan routing */
  activeAgent: Annotation<AgentName | null>(last<AgentName | null>(null)),
  routeReason: Annotation<string>(last<string>("")),
  routeConfidence: Annotation<number>(last<number>(0)),

  /* hasil agent terpilih */
  agentResult: Annotation<AgentResult | null>(last<AgentResult | null>(null)),
  reply: Annotation<string>(last<string>("")),
  filtered: Annotation<boolean>(last<boolean>(false)),

  /* observability — array kosong pada input mereset log untuk turn baru */
  trace: Annotation<TraceEntry[]>({
    reducer: (prev: TraceEntry[], next: TraceEntry[]) =>
      next.length === 0 ? [] : prev.concat(next),
    default: () => [],
  }),
  errors: Annotation<string[]>({
    reducer: (prev: string[], next: string[]) =>
      next.length === 0 ? [] : prev.concat(next),
    default: () => [],
  }),
});

export type SupervisorStateType = typeof SupervisorState.State;
export type SupervisorUpdateType = typeof SupervisorState.Update;
