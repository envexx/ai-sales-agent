import { z } from "zod";
import { traceEntry } from "../../graph/nodes/helpers.js";
import { structuredInvoke } from "../../llm/index.js";
import { briefBlock, plannerPrompt } from "../prompts.js";
import type { ResearchStateType, ResearchUpdateType } from "../state.js";
import type { PlanTask } from "../types.js";

const PlanSchema = z.object({
  tasks: z
    .array(
      z.object({
        question: z.string(),
        queries: z.array(z.string()).min(1).max(4),
        rationale: z.string(),
      }),
    )
    .min(1)
    .max(8),
});

/**
 * Node 1 — Parameterized Planner.
 *
 * Iterasi pertama: pecah objective jadi beberapa tugas. Iterasi lanjutan:
 * fokus menutup `gaps` dari evaluator.
 */
export async function plannerNode(
  state: ResearchStateType,
): Promise<ResearchUpdateType> {
  const brief = state.brief;
  if (!brief) return { errors: ["planner: brief kosong"] };

  const firstPass = state.iteration === 0;
  const knownSources = state.sources
    .slice(-20)
    .map((s) => `[${s.id}] ${s.title} — ${s.url}`)
    .join("\n");
  const knownFacts = state.facts
    .slice(-25)
    .map((f) => `- ${f.claim}`)
    .join("\n");

  const human = [
    briefBlock(brief),
    firstPass
      ? "Ini iterasi pertama. Pecah objective menjadi tugas-tugas riset yang saling melengkapi."
      : `Iterasi ke-${state.iteration + 1}. Fokus menutup gap berikut:\n${
          state.gaps.map((g) => `- ${g}`).join("\n") || "- (tidak ada gap tercatat)"
        }`,
    `Sumber yang sudah dikumpulkan (jangan diulang):\n${knownSources || "(belum ada)"}`,
    `Fakta yang sudah diketahui:\n${knownFacts || "(belum ada)"}`,
    `Buat maksimal ${firstPass ? 6 : 4} tugas, masing-masing dengan query pencarian.`,
  ].join("\n\n");

  try {
    const plan = await structuredInvoke({
      schema: PlanSchema,
      system: plannerPrompt.system,
      human,
      name: "ResearchPlan",
      temperature: 0.2,
    });
    const tasks: PlanTask[] = plan.tasks;
    return {
      plan: tasks,
      iteration: state.iteration + 1,
      trace: [
        traceEntry("planner", {
          iteration: state.iteration + 1,
          tasks: tasks.length,
          queries: tasks.reduce((n, t) => n + t.queries.length, 0),
        }),
      ],
    };
  } catch (err) {
    // Fallback: pakai objective sebagai satu query agar engine tetap jalan.
    const tasks: PlanTask[] = [
      { question: brief.objective, queries: [brief.objective], rationale: "fallback" },
    ];
    return {
      plan: tasks,
      iteration: state.iteration + 1,
      errors: [`planner: ${(err as Error).message}`],
      trace: [traceEntry("planner", { fallback: true })],
    };
  }
}
