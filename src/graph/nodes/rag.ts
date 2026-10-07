import { env } from "../../config/env.js";
import { retrieveKnowledge } from "../../memory/knowledge.js";
import { retrieveMemory } from "../../memory/ltm.js";
import { getLeadById } from "../../repository/index.js";
import { todayKey } from "../../util/time.js";
import type { RetrievedDoc } from "../../types.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import { formatContext, traceEntry, transcript } from "./helpers.js";

/** Ringkasan hasil Scout (pain-point, tawaran & sudut pendekatan) sebagai konteks. */
interface ScoutMeta {
  painPoints?: string[];
  opportunity?: string;
  offerings?: string[];
  approach?: string;
  outreachAngle?: string;
  confidence?: number;
}

function scoutDoc(leadId: string, scout: ScoutMeta | undefined): RetrievedDoc | null {
  if (!scout) return null;
  const content = [
    scout.painPoints?.length ? `Pain point:\n- ${scout.painPoints.join("\n- ")}` : "",
    scout.opportunity ? `Peluang otomasi: ${scout.opportunity}` : "",
    scout.offerings?.length
      ? `Yang bisa ditawarkan (solusi konkret):\n- ${scout.offerings.join("\n- ")}`
      : "",
    scout.approach ? `Cara mendekati & membangun: ${scout.approach}` : "",
    scout.outreachAngle ? `Sudut pendekatan (value-first): ${scout.outreachAngle}` : "",
    typeof scout.confidence === "number" ? `Keyakinan Scout: ${scout.confidence}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (!content) return null;
  return {
    id: `scout:${leadId}`,
    source: "scout",
    title: "Hasil Scout (pain-point, tawaran & cara pendekatan)",
    content,
    score: 1,
    metadata: { kind: "scout" },
  };
}

/**
 * Retrieval-Augmented Generation step.
 *
 * Pulls grounding from three sources in parallel:
 *   1. the knowledge base (products, pricing, FAQ, playbooks)
 *   2. long-term memory (reflections/facts from past conversations)
 *   3. **hasil Scout** untuk lead ini (pain-point & sudut pendekatan) — agar
 *      Sales tahu apa yang paling relevan untuk di-approach/closing.
 *
 * Sumber #2 merealisasikan edge "Long-Term Memory ──► RAG".
 */
export async function ragNode(state: SalesStateType): Promise<SalesUpdateType> {
  const query = [state.inboundMessage, transcript(state.messages, 6)]
    .filter(Boolean)
    .join("\n");

  try {
    const [knowledge, memory, lead] = await Promise.all([
      retrieveKnowledge(query, env.RAG_TOP_K),
      retrieveMemory({ queryText: query, leadId: state.leadId, k: env.LTM_TOP_K }),
      state.leadId ? getLeadById(state.leadId).catch(() => null) : Promise.resolve(null),
    ]);

    // Scout context ditaruh paling depan agar selalu ikut terkirim ke LLM.
    const scout = state.leadId
      ? scoutDoc(state.leadId, (lead?.meta as { scout?: ScoutMeta } | undefined)?.scout)
      : null;

    // Aturan sapaan harian: sekali per hari. Bila sudah disapa hari ini,
    // jangan ulangi sapaan; bila beda hari / belum, boleh menyapa.
    const greetedOn = (lead?.meta as { lastGreetedOn?: string } | undefined)?.lastGreetedOn;
    const greetedToday = Boolean(greetedOn) && greetedOn === todayKey();
    const greetingDoc: RetrievedDoc = {
      id: `greeting:${state.leadId}`,
      source: "memory",
      title: "Aturan sapaan harian",
      content: greetedToday
        ? `Klien SUDAH disapa hari ini (${greetedOn}). JANGAN mengulang sapaan waktu (Selamat pagi/siang/sore/malam) atau halo — langsung jawab inti pesannya.`
        : `Klien BELUM disapa hari ini. Awali balasan dengan TEPAT SATU sapaan waktu yang sesuai konteks waktu, lalu lanjut ke inti.`,
      score: 1,
      metadata: { kind: "greeting" },
    };

    const retrievedContext: RetrievedDoc[] = [
      greetingDoc,
      ...(scout ? [scout] : []),
      ...knowledge,
      ...memory,
    ];

    return {
      retrievedContext,
      trace: [
        traceEntry("rag", {
          knowledge: knowledge.length,
          memory: memory.length,
          scout: scout ? 1 : 0,
          preview: formatContext(retrievedContext, 2).slice(0, 280),
        }),
      ],
    };
  } catch (err) {
    return {
      retrievedContext: [],
      errors: [`rag: ${(err as Error).message}`],
      trace: [traceEntry("rag", { error: (err as Error).message })],
    };
  }
}
