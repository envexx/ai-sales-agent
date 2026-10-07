import { z } from "zod";
import { traceEntry } from "../../graph/nodes/helpers.js";
import { structuredInvoke } from "../../llm/index.js";
import { briefBlock, verifyPrompt } from "../prompts.js";
import type { ResearchStateType, ResearchUpdateType } from "../state.js";

const VerifySchema = z.object({
  satisfied: z.boolean(),
  depthReached: z.number().int().min(0).max(5),
  quality: z.number().min(0).max(10),
  gaps: z.array(z.string()).max(12),
  reason: z.string(),
});

/**
 * Node 4 — Strict Gap/Depth Evaluator.
 *
 * Menilai apakah riset sudah cukup dalam dan menentukan gap yang tersisa.
 * Keputusan loop diambil oleh conditional edge (lihat `index.ts`).
 */
export async function verifyNode(
  state: ResearchStateType,
): Promise<ResearchUpdateType> {
  const brief = state.brief;
  if (!brief) return { errors: ["verify: brief kosong"] };

  const factLines = state.facts
    .slice(0, 60)
    .map((f) => `[${f.sourceId}] ${f.claim}${f.excerpt ? ` — "${f.excerpt}"` : ""}`);
  const sourceLines = state.sources.map((s) => `[${s.id}] ${s.title} — ${s.url}`);

  const human = [
    briefBlock(brief),
    `Status: iterasi ${state.iteration}/${brief.maxIterations} · sumber ${state.sources.length}/${brief.maxSources} · fakta ${state.facts.length}.`,
    `Sumber terkumpul:\n${sourceLines.join("\n") || "(belum ada)"}`,
    `Fakta terkumpul:\n${factLines.join("\n") || "(belum ada)"}`,
    "Nilai apakah objective sudah terjawab menyeluruh, lalu tentukan gap yang tersisa.",
  ].join("\n\n");

  try {
    const verdict = await structuredInvoke({
      schema: VerifySchema,
      system: verifyPrompt.system,
      human,
      name: "ResearchVerify",
      temperature: 0,
    });
    return {
      satisfied: verdict.satisfied,
      depth: verdict.depthReached,
      quality: verdict.quality,
      gaps: verdict.gaps,
      trace: [
        traceEntry("verify", {
          satisfied: verdict.satisfied,
          depth: verdict.depthReached,
          quality: verdict.quality,
          gaps: verdict.gaps.length,
        }),
      ],
    };
  } catch (err) {
    // Fail-safe: tanpa verdict, gap dikosongkan agar graph menuju formatter
    // (bukan loop tanpa henti).
    return {
      gaps: [],
      errors: [`verify: ${(err as Error).message}`],
      trace: [traceEntry("verify", { fallback: true })],
    };
  }
}
