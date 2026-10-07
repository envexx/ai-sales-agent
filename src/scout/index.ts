import { z } from "zod";
import { loggerFor } from "../config/logger.js";
import { firecrawlScrape } from "../integrations/firecrawl.js";
import { tavilyConfigured, tavilyExtract, tavilySearch } from "../integrations/tavily.js";
import { structuredInvoke } from "../llm/index.js";
import { emitEvent } from "../pipeline/events.js";
import { markLeadScoutedReady } from "../pipeline/lifecycle.js";
import { retrieveKnowledge } from "../memory/knowledge.js";
import type { JobRecord, JobResult } from "../pipeline/types.js";
import { getLeadById, updateLead } from "../repository/index.js";

const log = loggerFor("scout");

const ScoutSchema = z.object({
  painPoints: z.array(z.string()).max(6),
  opportunity: z.string(),
  /** Apa yang ditawarkan: solusi/produk konkret untuk jenis usaha ini. */
  offerings: z.array(z.string()).max(6),
  /** Bagaimana mendekati & membangun (langkah implementasi ringkas). */
  approach: z.string(),
  outreachAngle: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * Ambil isi situs bisnis. Tavily `/extract` dicoba dulu (cepat & bersih),
 * lalu fallback ke Firecrawl bila kosong/gagal.
 */
async function fetchSiteText(url: string): Promise<string> {
  if (tavilyConfigured()) {
    try {
      const [first] = await tavilyExtract([url]);
      const raw = (first?.rawContent ?? "").trim();
      if (raw.length > 100) return raw.slice(0, 6000);
    } catch {
      /* fallback ke firecrawl */
    }
  }
  try {
    const page = await firecrawlScrape(url, { onlyMainContent: true });
    return (page?.markdown ?? "").slice(0, 6000);
  } catch {
    return "";
  }
}

/**
 * Scout — Audit & Pain-Point.
 *
 * Dipicu setelah `prospect.discovered`. Menyusun hipotesis masalah dan sudut
 * pendekatan outreach dari sinyal yang tersedia (kategori, rating/ulasan, dan
 * isi situs bisnis). Karena sumber dibatasi scraping tanpa API, teks ulasan
 * individual belum diambil — Scout memakai rating/volume + isi situs sebagai
 * proksi, dan menandai tingkat keyakinan.
 */
export async function scoutAudit(job: JobRecord): Promise<JobResult> {
  const payload = job.payload as {
    leadId?: string;
    name?: string;
    website?: string | null;
    rating?: number | null;
    reviews?: number | null;
    category?: string | null;
    niche?: string;
    location?: string;
  };

  if (!payload.leadId) return { ok: false, note: "leadId wajib" };

  const lead = await getLeadById(payload.leadId);
  if (!lead) return { ok: false, note: "lead tidak ditemukan" };

  let siteText = "";
  if (payload.website) {
    siteText = await fetchSiteText(payload.website);
  }

  // Sinyal tambahan dari pencarian web (ulasan, layanan, berita) untuk memperkuat analisis.
  let webBlock = "";
  try {
    const q = [payload.name ?? lead.company, payload.location, payload.niche]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (q && tavilyConfigured()) {
      const hits = await tavilySearch(q, { limit: 5 });
      webBlock = hits
        .map(
          (hit) =>
            `- ${hit.title || hit.url}: ${(hit.content || "").replace(/\s+/g, " ").slice(0, 240)}`,
        )
        .join("\n");
    }
  } catch {
    /* opsional */
  }

  // Flywheel: ambil studi kasus relevan untuk memperkuat sudut outreach.
  let caseBlock = "";
  try {
    const q = [payload.niche, payload.category, payload.location]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (q) {
      const docs = await retrieveKnowledge(q, 4);
      const cases = docs.filter(
        (d) =>
          d.metadata?.kind === "case_study" || d.metadata?.kind === "case_study_snippet",
      );
      caseBlock = cases
        .map((d) => `- ${d.title}: ${d.content.replace(/\s+/g, " ").slice(0, 350)}`)
        .join("\n");
    }
  } catch {
    /* knowledge opsional */
  }

  const human = [
    `Bisnis: ${payload.name ?? lead.company ?? "(tanpa nama)"}`,
    `Kategori: ${payload.category ?? "-"}`,
    `Niche: ${payload.niche ?? "-"} · Lokasi: ${payload.location ?? "-"}`,
    `Rating Google: ${payload.rating ?? "-"} (${payload.reviews ?? "-"} ulasan)`,
    payload.website ? `Website: ${payload.website}` : "Website: tidak ditemukan",
    siteText ? `Isi situs:\n"""${siteText}"""` : "Isi situs: tidak tersedia",
    webBlock ? `Sinyal web tambahan (dari pencarian):\n${webBlock}` : "Sinyal web tambahan: (tidak ada)",
    caseBlock ? `Studi kasus relevan (bukti sosial, dari flywheel):\n${caseBlock}` : "Studi kasus relevan: (belum ada)",
  ].join("\n");

  try {
    const audit = await structuredInvoke({
      schema: ScoutSchema,
      system:
        "Kamu adalah Pain-Point Scout untuk agensi otomasi AI/software. Dari sinyal bisnis yang diberikan, hasilkan:\n" +
        "- painPoints: masalah operasional paling mungkin (proses manual, respons lambat, jadwal/antre, pencatatan order, follow-up pelanggan, dsb.).\n" +
        "- opportunity: ringkasan peluang otomasi yang relevan untuk JENIS USAHA ini.\n" +
        "- offerings: 3-6 hal konkret yang akan KITA tawarkan (solusi/produk), spesifik ke jenis usaha ini — bukan generik.\n" +
        "- approach: BAGAIMANA mendekati & membangun solusinya (langkah implementasi ringkas, mis. audit alur → pilot 1 cabang → integrasi WhatsApp → ukur hasil).\n" +
        "- outreachAngle: pembuka value-first (bukan jualan generik).\n" +
        "- confidence: 0..1 sesuai kekuatan sinyal; turunkan bila sinyal minim.\n" +
        "ATURAN KETAT: JANGAN mengarang studi kasus, nama klien, atau angka hasil (mis. 'naik 35%', 'hemat 15 jam'). " +
        "Gunakan angka HANYA bila benar-benar ada pada konteks yang diberikan. Bila tidak ada studi kasus di konteks, " +
        "tulis sudut outreach sebagai hipotesis TANPA klaim hasil apa pun.",
      human,
      name: "ScoutAudit",
      temperature: 0.3,
    });

    await updateLead({
      id: lead.id,
      meta: {
        scout: {
          painPoints: audit.painPoints,
          opportunity: audit.opportunity,
          offerings: audit.offerings,
          approach: audit.approach,
          outreachAngle: audit.outreachAngle,
          confidence: audit.confidence,
          at: new Date().toISOString(),
        },
      },
    });

    // Gate: lead siap dikerjakan Sales/outreach setelah Scout menilai.
    await markLeadScoutedReady(lead.id);

    await emitEvent("prospect.scouted", {
      entityType: "lead",
      entityId: lead.id,
      payload: { painPoints: audit.painPoints.length, confidence: audit.confidence },
    });

    log.info({ leadId: lead.id, confidence: audit.confidence }, "scout selesai");
    return {
      ok: true,
      note: `scout: ${audit.painPoints.length} pain point (confidence ${audit.confidence})`,
      data: { leadId: lead.id },
    };
  } catch (err) {
    return { ok: false, note: `scout: ${(err as Error).message}` };
  }
}
