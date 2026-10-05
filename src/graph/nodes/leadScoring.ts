import { z } from "zod";
import { env } from "../../config/env.js";
import { structuredInvoke } from "../../llm/index.js";
import { scoringPrompt } from "../prompts.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import type { LeadSegment, ScoreBreakdown } from "../../types.js";
import { formatContext, traceEntry, transcript } from "./helpers.js";

const ScoreSchema = z.object({
  score: z.number().min(0).max(100),
  factors: z
    .array(
      z.object({
        label: z.string(),
        weight: z.number().min(0).max(1),
        note: z.string().optional(),
      }),
    )
    .describe("faktor-faktor yang mempengaruhi skor"),
  rationale: z.string(),
});

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

interface HeuristicSignal {
  score: number;
  signals: string[];
}

/** Deterministic, explainable portion of the score. */
function heuristicScore(text: string): HeuristicSignal {
  const t = text.toLowerCase();
  let score = 0;
  const signals: string[] = [];
  const add = (n: number, label: string) => {
    score += n;
    signals.push(`${label} (${n > 0 ? "+" : ""}${n})`);
  };

  if (/harga|price|biaya|paket|pricing|berapa/.test(t)) add(15, "menanyakan harga");
  if (/beli|order|deal|bayar|pembayaran|invoice|langganan/.test(t)) add(25, "sinyal pembelian");
  if (/demo|jadwal|meeting|konsultasi|booking|survey|telepon|call/.test(t)) add(20, "minat demo/meeting");
  if (/segera|urgent|cepat|butuh sekarang|minggu ini|bulan ini|deadline/.test(t)) add(15, "urgensi tinggi");
  if (/budget|anggaran|dana/.test(t)) add(15, "menyebut budget");
  if (/\b(ceo|owner|founder|direktur|manager|manajer|kepala|pj penanggung)\b/.test(t)) add(10, "pengambil keputusan");
  if (/tertarik|minat|berminat|mantap|cocok|setuju/.test(t)) add(10, "menyatakan minat");
  if (/bisa|boleh|apakah|bagaimana|apa itu|\?/.test(t)) add(5, "aktif bertanya");
  if (/mahal|kemahalan|nanti|pikir|ragu|belum yakin|tidak bisa|sayangnya/.test(t)) add(-10, "indikasi keberatan");
  if (t.length > 200) add(5, "pesan panjang (keterlibatan tinggi)");

  return { score: clamp(score, 0, 100), signals };
}

function toSegment(score: number): LeadSegment {
  if (score >= env.SCORE_THRESHOLD_HIGH) return "closing";
  if (score >= env.SCORE_THRESHOLD_LOW) return "objection";
  return "nurture";
}

export async function leadScoringNode(state: SalesStateType): Promise<SalesUpdateType> {
  const heuristic = heuristicScore(state.inboundMessage);
  const context = formatContext(state.retrievedContext, 4);

  try {
    const model = await structuredInvoke({
      schema: ScoreSchema,
      system: scoringPrompt.system,
      human: [
        `Konteks:\n${context}`,
        `Transkrip singkat:\n${transcript(state.messages, 8)}`,
        `Pesan terakhir prospek:\n"""${state.inboundMessage}"""`,
        `Sinyal heuristik (referensi): ${JSON.stringify(heuristic.signals)} (subtotal ${heuristic.score})`,
      ].join("\n\n"),
      name: "LeadScore",
      temperature: 0,
    });

    // Blend explainable heuristics with the model's judgement.
    const blended = Math.round(heuristic.score * 0.4 + model.score * 0.6);
    const leadScore = clamp(blended, 0, 100);
    const segment = toSegment(leadScore);

    const breakdown: ScoreBreakdown = {
      heuristic: heuristic.score,
      model: Math.round(model.score),
      factors: model.factors,
      rationale: model.rationale,
    };

    return {
      leadScore,
      scoreBreakdown: breakdown,
      segment,
      trace: [
        traceEntry("leadScoring", {
          leadScore,
          heuristic: heuristic.score,
          model: Math.round(model.score),
          segment,
          signals: heuristic.signals,
        }),
      ],
    };
  } catch (err) {
    // Degrade gracefully to heuristics only.
    const leadScore = heuristic.score;
    const segment = toSegment(leadScore);
    return {
      leadScore,
      segment,
      scoreBreakdown: {
        heuristic: heuristic.score,
        model: 0,
        factors: heuristic.signals.map((s) => ({ label: s, weight: 0.1 })),
        rationale: `Fallback heuristik (LLM gagal): ${(err as Error).message}`,
      },
      errors: [`leadScoring: ${(err as Error).message}`],
      trace: [traceEntry("leadScoring", { fallback: true, leadScore, segment })],
    };
  }
}
