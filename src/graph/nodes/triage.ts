import { z } from "zod";
import { structuredInvoke } from "../../llm/index.js";
import { triagePrompt } from "../prompts.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import type { Intent, TriageResult } from "../../types.js";
import { traceEntry } from "./helpers.js";

const INTENTS = [
  "greeting",
  "question",
  "pricing",
  "objection",
  "interested",
  "ready_to_buy",
  "booking",
  "smalltalk",
  "unknown",
] as const;

const TriageSchema = z.object({
  isBot: z.boolean(),
  botReason: z.string().nullable(),
  intent: z.enum(INTENTS),
  language: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  urgency: z.enum(["low", "medium", "high"]),
  summary: z.string(),
});

/** Cheap, deterministic guards that run before spending an LLM call. */
const BOT_PATTERNS: RegExp[] = [
  /pesan (ini )?(di)?kirim (secara )?otomatis/i,
  /this (is an )?automated/i,
  /do not reply|jangan balas/i,
  /auto[- ]?reply|autoreply/i,
  /\botp\b|kode verifikasi|verification code/i,
  /one[- ]time (password|code)|kode rahasia/i,
  /unsubscribe|berhenti berlangganan/i,
  /balas( dengan)? (angka|nomor)|ketik \d|pilih menu|menu:/i,
  /broadcast|promo (spesial )?berikut/i,
  /(notifikasi|pemberitahuan) (transaksi|pengiriman|pesanan)/i,
];

function heuristicBotCheck(text: string): { isBot: boolean; reason: string | null } {
  const t = text.trim();
  if (t.length === 0) return { isBot: true, reason: "empty message" };
  for (const re of BOT_PATTERNS) {
    if (re.test(t)) return { isBot: true, reason: `matched ${re.source}` };
  }
  return { isBot: false, reason: null };
}

export async function triageNode(state: SalesStateType): Promise<SalesUpdateType> {
  const text = state.inboundMessage;
  const heuristic = heuristicBotCheck(text);

  if (heuristic.isBot) {
    const triage: TriageResult = {
      isBot: true,
      botReason: heuristic.reason,
      intent: "unknown",
      language: "unknown",
      sentiment: "neutral",
      urgency: "low",
      summary: "Pesan otomatis/sistem.",
    };
    return {
      isBot: true,
      triage,
      trace: [traceEntry("triage", { via: "heuristic", reason: heuristic.reason })],
    };
  }

  try {
    const triage = await structuredInvoke({
      schema: TriageSchema,
      system: triagePrompt.system,
      human: `Pesan masuk:\n"""${text}"""`,
      name: "Triage",
      temperature: 0,
    });
    return {
      isBot: triage.isBot,
      triage,
      trace: [
        traceEntry("triage", {
          via: "llm",
          isBot: triage.isBot,
          intent: triage.intent as Intent,
          urgency: triage.urgency,
        }),
      ],
    };
  } catch (err) {
    // Fail-open: treat as a human so we never drop a real lead.
    return {
      isBot: false,
      triage: null,
      errors: [`triage: ${(err as Error).message}`],
      trace: [traceEntry("triage", { error: (err as Error).message })],
    };
  }
}
