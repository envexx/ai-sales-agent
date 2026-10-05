import { z } from "zod";
import { structuredInvoke } from "../../llm/index.js";
import { businessContext, strategyPrompt } from "../prompts.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import type { LeadSegment, ScoreBreakdown, StrategyResult } from "../../types.js";
import { formatContext, traceEntry, transcript } from "./helpers.js";

const StrategySchema = z.object({
  approach: z.string().describe("pendekatan utama yang akan dipakai"),
  tone: z.string().describe("nada bicara"),
  keyPoints: z.array(z.string()).min(1).describe("poin kunci yang harus disampaikan"),
  objectionType: z.string().nullable().describe("jenis keberatan bila ada"),
  cta: z.string().describe("ajakan bertindak yang jelas"),
  playbook: z.array(z.string()).describe("langkah taktis berurutan"),
});

async function buildStrategy(
  state: SalesStateType,
  segment: LeadSegment,
): Promise<SalesUpdateType> {
  const { system, focus } = strategyPrompt(segment);
  const context = formatContext(state.retrievedContext, 4);
  const breakdown: ScoreBreakdown | null = state.scoreBreakdown;

  try {
    const res = await structuredInvoke({
      schema: StrategySchema,
      system,
      human: [
        `Konteks bisnis:\n${businessContext}`,
        `Fokus strategi: ${focus}`,
        `Skor lead: ${state.leadScore} (${segment})`,
        breakdown ? `Rasional skor: ${breakdown.rationale}` : "",
        `Konteks RAG:\n${context}`,
        `Transkrip:\n${transcript(state.messages, 10)}`,
        `Pesan terakhir prospek:\n"""${state.inboundMessage}"""`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      name: "Strategy",
      temperature: 0.4,
    });

    const strategy: StrategyResult = { segment, ...res };
    return {
      segment,
      strategy,
      trace: [traceEntry(`strategy:${segment}`, { cta: res.cta })],
    };
  } catch (err) {
    const strategy: StrategyResult = {
      segment,
      approach: `Pendekatan ${segment} (fallback)`,
      tone: "ramah dan profesional",
      keyPoints: ["Dengarkan kebutuhan prospek", "Beri nilai", "Tawarkan langkah berikutnya"],
      objectionType: null,
      cta: "Ada yang bisa saya bantu lebih lanjut?",
      playbook: ["akui pesan", "jawab inti", "tawarkan langkah lanjut"],
    };
    return {
      segment,
      strategy,
      errors: [`strategy:${segment}: ${(err as Error).message}`],
      trace: [traceEntry(`strategy:${segment}`, { fallback: true })],
    };
  }
}

/** < 40 — build trust, no hard sell. */
export const nurtureNode = (state: SalesStateType) => buildStrategy(state, "nurture");
/** 40–74 — handle objections and advance. */
export const objectionNode = (state: SalesStateType) => buildStrategy(state, "objection");
/** >= 75 — close / secure the next step. */
export const closingNode = (state: SalesStateType) => buildStrategy(state, "closing");
