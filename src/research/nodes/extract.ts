import { z } from "zod";
import { env } from "../../config/env.js";
import { traceEntry } from "../../graph/nodes/helpers.js";
import { structuredInvoke } from "../../llm/index.js";
import { briefBlock, extractPrompt } from "../prompts.js";
import type { ResearchStateType, ResearchUpdateType } from "../state.js";
import type { Fact } from "../types.js";
import { mapLimit } from "../util.js";

const ExtractSchema = z.object({
  facts: z
    .array(
      z.object({
        claim: z.string(),
        topic: z.string(),
        confidence: z.number().min(0).max(1),
        excerpt: z.string().optional(),
      }),
    )
    .max(8),
});

/** Kunci dedup fakta (case & tanda baca diabaikan). */
function factKey(claim: string): string {
  return claim.toLowerCase().replace(/\W+/g, " ").trim();
}

/**
 * Node 3 — Context Pruning & Fact Extraction.
 *
 * Isi tiap sumber sudah dipangkas saat ingestion. Di sini LLM mengekstrak
 * fakta atomik yang dapat dikutip, hanya untuk sumber yang belum diproses.
 */
export async function extractNode(
  state: ResearchStateType,
): Promise<ResearchUpdateType> {
  const brief = state.brief;
  if (!brief) return { errors: ["extract: brief kosong"] };

  const processed = new Set(state.processedSourceIds);
  const pending = state.sources.filter((s) => !processed.has(s.id));
  if (pending.length === 0) {
    return { trace: [traceEntry("extract", { skipped: "tidak ada sumber baru" })] };
  }

  const batches = await mapLimit(pending, 2, async (source) => {
    try {
      const out = await structuredInvoke({
        schema: ExtractSchema,
        system: extractPrompt.system,
        human: [
          briefBlock(brief),
          `Sumber [${source.id}] ${source.title} — ${source.url}`,
          `Isi halaman:\n"""${source.content}"""`,
        ].join("\n\n"),
        name: "FactExtraction",
        temperature: 0,
      });
      return { source, raw: out.facts, error: null as string | null };
    } catch (err) {
      return { source, raw: [], error: (err as Error).message };
    }
  });

  let nextId = state.facts.length;
  const collected: Fact[] = [];
  const errors: string[] = [];

  for (const batch of batches) {
    if (batch.error) errors.push(`extract [${batch.source.id}]: ${batch.error}`);
    for (const raw of batch.raw) {
      collected.push({
        id: ++nextId,
        claim: raw.claim.trim(),
        topic: raw.topic.trim() || "umum",
        confidence: raw.confidence,
        sourceId: batch.source.id,
        url: batch.source.url,
        title: batch.source.title,
        excerpt: (raw.excerpt ?? "").trim(),
      });
    }
  }

  const seen = new Set(state.facts.map((f) => factKey(f.claim)));
  const deduped = collected.filter((fact) => {
    const key = factKey(fact.claim);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const remaining = Math.max(0, env.RESEARCH_MAX_FACTS - state.facts.length);
  const facts = deduped.slice(0, remaining);

  return {
    ...(facts.length ? { facts } : {}),
    processedSourceIds: pending.map((s) => s.id),
    ...(errors.length ? { errors } : {}),
    trace: [
      traceEntry("extract", {
        sources: pending.length,
        newFacts: facts.length,
        duplicates: collected.length - deduped.length,
        droppedByCap: deduped.length - facts.length,
      }),
    ],
  };
}
