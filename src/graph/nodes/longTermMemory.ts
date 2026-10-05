import { env } from "../../config/env.js";
import { loggerFor } from "../../config/logger.js";
import { writeMemory } from "../../memory/ltm.js";
import { updateLead } from "../../repository/index.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import { traceEntry } from "./helpers.js";

const log = loggerFor("node:longTermMemory");

const STAGE_BY_SEGMENT: Record<string, string> = {
  nurture: "nurturing",
  objection: "objection-handling",
  closing: "ready-to-close",
};

/**
 * Persist the reflection into long-term memory and update the lead record.
 *
 * This closes the diagram's feedback edge "Long-Term Memory ──► RAG": the
 * memory written here is retrieved by the RAG node on the next conversation
 * turn. When MAX_REFLECTION_LOOPS > 0 the graph can additionally re-enter RAG
 * immediately to revise a low-quality draft.
 */
export async function longTermMemoryNode(
  state: SalesStateType,
): Promise<SalesUpdateType> {
  const update: SalesUpdateType = {
    reflectionLoops: state.reflectionLoops + 1,
  };
  const trace = [traceEntry("longTermMemory", {})];

  try {
    if (state.reflection) {
      const r = state.reflection;
      const content = [
        `Pelajaran: ${r.lesson}`,
        `Panduan: ${r.guidance}`,
        r.whatWorked.length ? `Berhasil: ${r.whatWorked.join("; ")}` : "",
        r.whatToImprove.length ? `Perbaiki: ${r.whatToImprove.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const memoryId = await writeMemory({
        leadId: state.leadId,
        waJid: state.waJid,
        threadId: state.threadId,
        kind: "reflection",
        content,
        importance: r.importance,
        metadata: {
          segment: state.segment,
          leadScore: state.leadScore,
          evaluation: state.evaluation?.overall ?? null,
        },
      });
      update.memoryWritten = true;
      update.memoryId = memoryId;
      trace[0]!.detail = { memoryId, importance: r.importance };
    }
  } catch (err) {
    update.errors = [`longTermMemory: ${(err as Error).message}`];
    log.error({ err: (err as Error).message }, "failed to write memory");
  }

  // Keep the lead record up to date.
  if (state.leadId) {
    try {
      await updateLead({
        id: state.leadId,
        score: state.leadScore,
        segment: state.segment,
        stage: state.booking?.status === "confirmed" ? "booked" : STAGE_BY_SEGMENT[state.segment ?? ""],
        meta: { lastIntent: state.triage?.intent ?? null },
      });
    } catch {
      /* best-effort */
    }
  }

  // Decide whether to re-enter RAG for a self-improvement pass.
  const poorQuality = (state.evaluation?.overall ?? 10) < 5;
  const canLoop = state.reflectionLoops < env.MAX_REFLECTION_LOOPS;
  update.reenterForImprovement = poorQuality && canLoop;
  if (update.reenterForImprovement) {
    update.finalResponse = "";
    update.dispatched = false;
    update.strategy = null;
  }
  trace[0]!.detail = { ...(trace[0]!.detail ?? {}), reenter: update.reenterForImprovement };

  return { ...update, trace };
}
