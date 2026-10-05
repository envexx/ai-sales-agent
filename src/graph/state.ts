import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type {
  BookingInfo,
  CalBooking,
  Evaluation,
  LeadSegment,
  Reflection,
  RetrievedDoc,
  ScoreBreakdown,
  StrategyResult,
  TraceEntry,
  TriageResult,
} from "../types.js";

/** Last write wins. The explicit generic on the call site keeps `Update` typed. */
const last = <T,>(def: T) => ({
  reducer: (_prev: T, next: T): T => next,
  default: (): T => def,
});

export const SalesState = Annotation.Root({
  /* identity */
  threadId: Annotation<string>(last<string>("")),
  leadId: Annotation<string | null>(last<string | null>(null)),
  waJid: Annotation<string>(last<string>("")),
  contactName: Annotation<string | null>(last<string | null>(null)),

  /* inbound turn */
  inboundMessage: Annotation<string>(last<string>("")),
  receivedAt: Annotation<string>(last<string>("")),
  messageId: Annotation<string | null>(last<string | null>(null)),

  /* rolling conversation memory (persisted by the checkpointer) */
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  /* triage / bot detection */
  triage: Annotation<TriageResult | null>(last<TriageResult | null>(null)),
  isBot: Annotation<boolean>(last<boolean>(false)),
  filtered: Annotation<boolean>(last<boolean>(false)),

  /* RAG */
  retrievedContext: Annotation<RetrievedDoc[]>(last<RetrievedDoc[]>([])),

  /* lead scoring */
  leadScore: Annotation<number>(last<number>(0)),
  scoreBreakdown: Annotation<ScoreBreakdown | null>(last<ScoreBreakdown | null>(null)),
  segment: Annotation<LeadSegment | null>(last<LeadSegment | null>(null)),

  /* strategy branch */
  strategy: Annotation<StrategyResult | null>(last<StrategyResult | null>(null)),

  /* response */
  draftResponse: Annotation<string>(last<string>("")),
  finalResponse: Annotation<string>(last<string>("")),

  /* dispatch */
  dispatched: Annotation<boolean>(last<boolean>(false)),
  dispatchMessageId: Annotation<string | null>(last<string | null>(null)),

  /* booking / follow-up */
  booking: Annotation<BookingInfo | null>(last<BookingInfo | null>(null)),

  /* Cal.com scheduling (MCP) */
  availableSlots: Annotation<string[]>(last<string[]>([])),
  calBooking: Annotation<CalBooking | null>(last<CalBooking | null>(null)),
  schedulingNote: Annotation<string>(last<string>("")),

  /* evaluation + reflection */
  evaluation: Annotation<Evaluation | null>(last<Evaluation | null>(null)),
  reflection: Annotation<Reflection | null>(last<Reflection | null>(null)),

  /* long-term memory */
  memoryWritten: Annotation<boolean>(last<boolean>(false)),
  memoryId: Annotation<string | null>(last<string | null>(null)),

  /* self-improvement loop (Long-Term Memory ──► RAG) */
  reflectionLoops: Annotation<number>(last<number>(0)),
  reenterForImprovement: Annotation<boolean>(last<boolean>(false)),

  /* tracing — an empty array in the input resets the log for the new turn */
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

export type SalesStateType = typeof SalesState.State;
export type SalesUpdateType = typeof SalesState.Update;
