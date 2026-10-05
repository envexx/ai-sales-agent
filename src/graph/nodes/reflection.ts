import { z } from "zod";
import { structuredInvoke } from "../../llm/index.js";
import { reflectionPrompt } from "../prompts.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import type { Reflection } from "../../types.js";
import { traceEntry, transcript } from "./helpers.js";

const ReflectionSchema = z.object({
  lesson: z.string(),
  whatWorked: z.array(z.string()),
  whatToImprove: z.array(z.string()),
  guidance: z.string(),
  importance: z.number().min(0).max(1),
});

/** Turn the critique into a reusable, memory-ready lesson. */
export async function reflectionNode(state: SalesStateType): Promise<SalesUpdateType> {
  const evaluation = state.evaluation;
  const human = [
    `Segment: ${state.segment ?? "n/a"} · Skor lead: ${state.leadScore}`,
    `Transkrip:\n${transcript(state.messages, 10)}`,
    `Balasan agen:\n"""${state.finalResponse}"""`,
    evaluation
      ? `Evaluasi:\n${JSON.stringify(evaluation, null, 2)}`
      : "Evaluasi: (tidak tersedia)",
  ].join("\n\n");

  try {
    const reflection = await structuredInvoke({
      schema: ReflectionSchema,
      system: reflectionPrompt.system,
      human,
      name: "Reflection",
      temperature: 0.2,
      reasoning: true,
    });
    return {
      reflection: reflection as Reflection,
      trace: [traceEntry("reflection", { importance: reflection.importance })],
    };
  } catch (err) {
    return {
      errors: [`reflection: ${(err as Error).message}`],
      trace: [traceEntry("reflection", { error: (err as Error).message })],
    };
  }
}
