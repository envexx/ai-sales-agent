import { Annotation } from "@langchain/langgraph";
import type { TraceEntry } from "../types.js";
import type {
  Fact,
  PlanTask,
  ResearchBrief,
  ResearchFormat,
  ResearchUsage,
  SearchHit,
  SourceDoc,
} from "./types.js";

/** Last write wins. */
const last = <T,>(def: T) => ({
  reducer: (_prev: T, next: T): T => next,
  default: (): T => def,
});

/** Append, tetapi input array kosong mereset log (memulai run baru). */
const append = <T,>() => ({
  reducer: (prev: T[], next: T[]): T[] => (next.length === 0 ? [] : prev.concat(next)),
  default: (): T[] => [],
});

const emptyUsage = (): ResearchUsage => ({
  searches: 0,
  fetched: 0,
  firecrawl: 0,
  camoufox: 0,
  failed: 0,
});

/**
 * State Universal Research Engine.
 *
 * `sources` dan `facts` menumpuk lintas iterasi; `plan`/`gaps` selalu berisi
 * hasil iterasi terbaru.
 */
export const ResearchState = Annotation.Root({
  /* identitas run */
  reportId: Annotation<string>(last<string>("")),
  brief: Annotation<ResearchBrief | null>(last<ResearchBrief | null>(null)),
  workspaceDir: Annotation<string>(last<string>("")),
  startedAt: Annotation<string>(last<string>("")),

  /* planning (terbaru) */
  plan: Annotation<PlanTask[]>(last<PlanTask[]>([])),

  /* ingestion (menumpuk) */
  searchResults: Annotation<SearchHit[]>(append<SearchHit>()),
  sources: Annotation<SourceDoc[]>(append<SourceDoc>()),

  /* extraction (menumpuk) */
  facts: Annotation<Fact[]>(append<Fact>()),
  /** Id sumber yang sudah diekstraksi (agar tidak diulang tiap iterasi). */
  processedSourceIds: Annotation<number[]>(append<number>()),

  /* evaluasi (terbaru) */
  gaps: Annotation<string[]>(last<string[]>([])),
  iteration: Annotation<number>(last<number>(0)),
  depth: Annotation<number>(last<number>(0)),
  quality: Annotation<number>(last<number>(0)),
  satisfied: Annotation<boolean>(last<boolean>(false)),

  /* output */
  summary: Annotation<string>(last<string>("")),
  report: Annotation<string>(last<string>("")),
  reportFormat: Annotation<ResearchFormat>(last<ResearchFormat>("markdown")),

  /* observability */
  usage: Annotation<ResearchUsage>(last<ResearchUsage>(emptyUsage())),
  trace: Annotation<TraceEntry[]>(append<TraceEntry>()),
  errors: Annotation<string[]>(append<string>()),
});

export type ResearchStateType = typeof ResearchState.State;
export type ResearchUpdateType = typeof ResearchState.Update;

/** Nilai reset untuk memulai satu run bersih. */
export function emptyUsageValue(): ResearchUsage {
  return emptyUsage();
}
