import { z } from "zod";
import { env } from "../../config/env.js";
import { traceEntry } from "../../graph/nodes/helpers.js";
import { structuredInvoke } from "../../llm/index.js";
import { AGENTS, AGENT_NAMES, DEFAULT_AGENT, type AgentName } from "../agents.js";
import { supervisorPrompt } from "../prompts.js";
import type { SupervisorStateType, SupervisorUpdateType } from "../state.js";

/** Skema keputusan routing yang diminta dari LLM. */
const RouteSchema = z.object({
  agent: z.enum(AGENT_NAMES),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * Kata kunci yang jelas mengarah ke Sales. Mencocokkannya menghemat satu
 * panggilan LLM tanpa mengorbankan akurasi.
 */
const SALES_HINTS =
  /(harga|biaya|budget|penawaran|quotation|demo|konsultasi|jadwal|booking|layanan|jasa|otomatisasi|automation|integrasi|aplikasi|website|web app|ai agent|prospek|lead|order|invoice|erp|crm)/i;

/** Kata kunci yang jelas mengarah ke Research Prospecting. */
const PROSPECTING_HINTS =
  /(cari\s+(prospek|klien|bisnis|pelanggan)|prospek|prospecting|google maps|maps|niche|daftar (bisnis|klien|calon))/i;

function heuristicRoute(text: string): { agent: AgentName; reason: string } | null {
  if (env.PROSPECTING_ENABLED && PROSPECTING_HINTS.test(text)) {
    return { agent: "prospecting", reason: "keyword prospecting" };
  }
  if (SALES_HINTS.test(text)) return { agent: DEFAULT_AGENT, reason: "keyword sales" };
  return null;
}

/**
 * Node supervisor: memutuskan agent mana yang menangani turn ini.
 *
 * Urutan keputusan: heuristik → (opsional) LLM → default. Routing tidak pernah
 * gagal total; jika LLM error, pesan jatuh ke agent default.
 */
export async function supervisorNode(
  state: SupervisorStateType,
): Promise<SupervisorUpdateType> {
  const text = state.inboundMessage.trim();

  const heuristic = heuristicRoute(text);
  if (heuristic) {
    return {
      activeAgent: heuristic.agent,
      routeReason: heuristic.reason,
      routeConfidence: 0.9,
      trace: [traceEntry("supervisor", { via: "heuristic", ...heuristic })],
    };
  }

  // Optimisasi: selama baru ada satu agent, LLM tidak perlu dipanggil. Jalur
  // LLM di bawah otomatis aktif begitu agent kedua ditambahkan, atau bisa
  // dipaksa dengan SUPERVISOR_FORCE_LLM=true.
  if (AGENTS.length === 1 && !env.SUPERVISOR_FORCE_LLM) {
    return {
      activeAgent: DEFAULT_AGENT,
      routeReason: "single-agent (routing tidak diperlukan)",
      routeConfidence: 1,
      trace: [traceEntry("supervisor", { via: "single-agent", agent: DEFAULT_AGENT })],
    };
  }

  try {
    const decision = await structuredInvoke({
      schema: RouteSchema,
      system: supervisorPrompt.system,
      human: `Pesan masuk:\n"""${text}"""`,
      name: "SupervisorRoute",
      temperature: 0,
    });
    return {
      activeAgent: decision.agent,
      routeReason: decision.reason,
      routeConfidence: decision.confidence,
      trace: [
        traceEntry("supervisor", {
          via: "llm",
          agent: decision.agent,
          confidence: decision.confidence,
        }),
      ],
    };
  } catch (err) {
    return {
      activeAgent: DEFAULT_AGENT,
      routeReason: "fallback (routing error)",
      routeConfidence: 0,
      errors: [`supervisor: ${(err as Error).message}`],
      trace: [traceEntry("supervisor", { error: (err as Error).message })],
    };
  }
}
