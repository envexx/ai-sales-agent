import { z } from "zod";
import { structuredInvoke } from "../../llm/index.js";
import { evaluationPrompt } from "../prompts.js";
import { saveEvaluation } from "../../repository/index.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import type { Evaluation } from "../../types.js";
import { formatContext, traceEntry } from "./helpers.js";

const EvalSchema = z.object({
  relevance: z.number().min(0).max(10),
  groundedness: z.number().min(0).max(10),
  tone: z.number().min(0).max(10),
  conversionLikelihood: z.number().min(0).max(10),
  overall: z.number().min(0).max(10),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  critique: z.string(),
});

/** Critic: score the generated reply before it becomes a learned lesson. */
export async function evaluationNode(state: SalesStateType): Promise<SalesUpdateType> {
  const context = formatContext(state.retrievedContext, 4);
  const human = [
    `Pesan terakhir prospek:\n"""${state.inboundMessage}"""`,
    `Balasan agen:\n"""${state.finalResponse}"""`,
    `Strategi yang dipakai: ${state.strategy?.segment ?? "n/a"} — ${state.strategy?.approach ?? ""}`,
    `Konteks yang tersedia:\n${context}`,
  ].join("\n\n");

  try {
    const evaluation = await structuredInvoke({
      schema: EvalSchema,
      system: evaluationPrompt.system,
      human,
      name: "Evaluation",
      temperature: 0,
      reasoning: true,
    });

    try {
      await saveEvaluation({
        threadId: state.threadId,
        leadId: state.leadId,
        evaluation: evaluation as Evaluation,
      });
    } catch {
      /* best-effort persistence */
    }

    return {
      evaluation: evaluation as Evaluation,
      trace: [
        traceEntry("evaluation", {
          overall: evaluation.overall,
          conversionLikelihood: evaluation.conversionLikelihood,
        }),
      ],
    };
  } catch (err) {
    return {
      errors: [`evaluation: ${(err as Error).message}`],
      trace: [traceEntry("evaluation", { error: (err as Error).message })],
    };
  }
}
