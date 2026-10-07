import { z } from "zod";
import { loggerFor } from "../config/logger.js";
import { structuredInvoke } from "../llm/index.js";
import { AGENT_HANDOFFS, AGENT_REGISTRY } from "../pipeline/agentRegistry.js";
import { emitEvent } from "../pipeline/events.js";
import { buildBriefingSnapshot } from "../pipeline/handlers/briefing.js";
import { buildGrowth, listImprovements, recordImprovement } from "../improvement/repository.js";
import { getOwnerProfile } from "./profile.js";
import { buildSupervisorReport } from "./report.js";

const log = loggerFor("supervisor:review");

/**
 * Supervisor V2 — tinjauan harian.
 *
 * Tugas (sesuai docs/SUPERVISOR.md § Supervisor V2):
 * 1. Memantau semua alur kerja agent sesuai keinginan owner & bisnis.
 * 2. Memberi saran & kritik kepada setiap agent untuk perbaikan.
 * 3. Mengusulkan perbaikan/pembaruan/penambahan (fitur/teknologi) kepada owner
 *    **dengan Tujuan & Dampak yang jelas**.
 * 4. Memastikan alur kerja & jalur koordinasi tetap terstruktur.
 * 5. Laporan jelas, tidak ambigu, bahasa mudah, sedikit istilah teknis.
 */

const ReviewSchema = z.object({
  ringkasan: z.string().describe("Ringkasan 2-3 kalimat, bahasa awam."),
  perAgent: z
    .array(
      z.object({
        agent: z.string().describe("slug agent"),
        penilaian: z.string().describe("penilaian singkat kinerja agent (bahasa awam)"),
        saran: z.string().describe("saran perbaikan konkret"),
        kritik: z.string().default("").describe("kritik bila ada yang kurang optimal (boleh kosong)"),
      }),
    )
    .max(20)
    .default([]),
  usulan: z
    .array(
      z.object({
        judul: z.string(),
        untukAgent: z.string().default("supervisor").describe("slug agent terdampak, atau 'supervisor'"),
        kategori: z.enum(["perbaikan", "fitur", "teknologi", "koordinasi"]),
        tujuan: z.string().describe("mengapa diusulkan (tujuan)"),
        dampak: z.string().describe("dampak yang diharapkan bila dijalankan"),
        detail: z.string().describe("langkah singkat"),
      }),
    )
    .max(8)
    .default([]),
  koordinasi: z.array(z.string()).max(6).default([]),
});

export interface SupervisorReviewResult {
  ringkasan: string;
  usulan: z.infer<typeof ReviewSchema>["usulan"];
  koordinasi: string[];
  perAgent: number;
  newSuggestions: number;
  anomalies: string[];
}

const inline = (record: Record<string, number>): string =>
  Object.entries(record).map(([k, v]) => `${k}: ${v}`).join(" · ") || "-";

const SYSTEM = `Kamu adalah **Supervisor V2** — penanggung jawab alur kerja seluruh agent di perusahaan ini.
Tugasmu: (1) memantau alur kerja semua agent agar selaras dengan tujuan owner & bisnis; (2) memberi saran dan
kritik yang membangun kepada SETIAP agent; (3) mengusulkan perbaikan/pembaruan/penambahan (fitur atau teknologi)
kepada owner dengan Tujuan dan Dampak yang jelas; (4) memastikan alur kerja & jalur koordinasi tetap terstruktur;
(5) menyusun laporan yang jelas, tidak ambigu, dan sedikit istilah teknis.

Aturan:
- Bahasa Indonesia yang mudah dipahami pemilik bisnis. Hindari jargon; bila terpaksa, jelaskan singkat.
- Bersandar HANYA pada data konteks. Jangan mengarang angka/kejadian.
- Kritik harus sopan, spesifik, dan disertai saran tindakan.
- Setiap usulan WAJIB punya tujuan (mengapa) dan dampak (hasil yang diharapkan).
- Jika tidak ada aktivitas/kendala, katakan apa adanya secara singkat.`;

/** Jalankan tinjauan Supervisor V2 (dipakai job `supervisor.review`). */
export async function runSupervisorReview(): Promise<SupervisorReviewResult> {
  const [report, growth, snapshot, profile] = await Promise.all([
    buildSupervisorReport(24),
    buildGrowth(14).catch(() => null),
    buildBriefingSnapshot().catch(() => null),
    getOwnerProfile().catch(() => ""),
  ]);

  const validSlugs = new Set(AGENT_REGISTRY.map((a) => a.slug));

  const agentLines = report.agents.map(
    (a) =>
      `- ${a.slug} (${a.name}): selesai ${a.done}, gagal ${a.failed}, antre ${a.queued}, jalan ${a.running}` +
      (a.approvalsPending ? `, approval ${a.approvalsPending}` : "") +
      (a.lastEventType ? `, aktivitas terakhir ${a.lastEventType}` : ""),
  );

  const growthLines = growth
    ? growth.agents
        .filter((a) => a.done + a.failed > 0 || a.suggestionsPending > 0)
        .map(
          (a) =>
            `- ${a.name}: selesai ${a.done}, gagal ${a.failed}, rasio ${a.successRate ?? "-"}%, tren ${a.trend}, usulan menunggu ${a.suggestionsPending}`,
        )
    : [];

  const chain = Object.entries(AGENT_HANDOFFS)
    .map(([from, to]) => `${from} → ${to.length ? to.join(", ") : "(akhir)"}`)
    .join("; ");

  const human = [
    profile ? `# Tujuan & prioritas owner\n${profile}` : "",
    snapshot
      ? `# Kondisi bisnis\nLead ${snapshot.leads} · proyek ${inline(snapshot.projectStages)} · approval tertunda ${snapshot.approvalsPending} · tiket ${inline(snapshot.ticketsOpen)}`
      : "",
    `# Aktivitas agent (24 jam)\n${agentLines.join("\n")}`,
    `# Kendala terdeteksi\n${report.anomalies.join("; ") || "tidak ada yang menonjol"}`,
    growthLines.length ? `# Tren 14 hari\n${growthLines.join("\n")}` : "",
    `# Jalur koordinasi (handoff)\n${chain}`,
    "Susun tinjauan sesuai tugas Supervisor V2.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let review: z.infer<typeof ReviewSchema>;
  try {
    review = await structuredInvoke({
      schema: ReviewSchema,
      system: SYSTEM,
      human,
      name: "SupervisorReview",
      temperature: 0.3,
      maxTokens: 2500,
    });
  } catch (err) {
    log.warn({ err: (err as Error).message }, "supervisor review LLM gagal");
    return {
      ringkasan: "Tinjauan otomatis tidak tersedia (gangguan LLM).",
      usulan: [],
      koordinasi: [],
      perAgent: 0,
      newSuggestions: 0,
      anomalies: report.anomalies,
    };
  }

  // Persist saran per-agent (yang perlu perhatian) + usulan owner, dengan dedup.
  const existing = await listImprovements({ kind: "suggestion", status: "proposed", limit: 300 }).catch(() => []);
  const seen = new Set(existing.map((i) => `${i.agent}|${i.title}`));
  const failedAgents = new Set(report.agents.filter((a) => a.failed > 0).map((a) => a.slug));
  let newSuggestions = 0;

  const persist = async (agent: string, title: string, detail: string, evidence: Record<string, unknown>) => {
    const key = `${agent}|${title}`;
    if (seen.has(key) || !validSlugs.has(agent)) return;
    seen.add(key);
    await recordImprovement({ agent, kind: "suggestion", status: "proposed", title, detail, evidence }).catch(() => {});
    newSuggestions += 1;
  };

  for (const fb of review.perAgent) {
    const needsAttention = Boolean(fb.kritik?.trim()) || failedAgents.has(fb.agent);
    if (!needsAttention) continue;
    await persist(
      fb.agent,
      `Saran Supervisor: ${fb.saran}`.slice(0, 140),
      [fb.penilaian, fb.kritik ? `Kritik: ${fb.kritik}` : "", `Saran: ${fb.saran}`].filter(Boolean).join("\n"),
      { source: "supervisor.review", kind: "agent" },
    );
  }

  for (const u of review.usulan) {
    const agent = validSlugs.has(u.untukAgent) ? u.untukAgent : "supervisor";
    await persist(
      agent,
      `Usulan (${u.kategori}): ${u.judul}`.slice(0, 140),
      `Tujuan: ${u.tujuan}\nDampak: ${u.dampak}\nLangkah: ${u.detail}`,
      { source: "supervisor.review", kind: "proposal", kategori: u.kategori },
    );
  }

  await emitEvent("supervisor.review", {
    payload: {
      ringkasan: review.ringkasan,
      usulan: review.usulan.length,
      perAgent: review.perAgent.length,
      newSuggestions,
      anomalies: report.anomalies.length,
    },
  });

  log.info(
    { perAgent: review.perAgent.length, usulan: review.usulan.length, newSuggestions, anomalies: report.anomalies.length },
    "tinjauan Supervisor V2 selesai",
  );

  return {
    ringkasan: review.ringkasan,
    usulan: review.usulan,
    koordinasi: review.koordinasi,
    perAgent: review.perAgent.length,
    newSuggestions,
    anomalies: report.anomalies,
  };
}

/** Ringkas tinjauan menjadi pesan owner (bahasa awam, sedikit teknis). */
export function formatSupervisorReview(r: SupervisorReviewResult): string {
  const lines: string[] = [r.ringkasan];

  if (r.anomalies.length) {
    lines.push("", "Perlu tindakan:");
    for (const a of r.anomalies) lines.push(`- ${a}`);
  }

  if (r.usulan.length) {
    lines.push("", "Usulan perbaikan/pembaruan (dengan tujuan & dampak):");
    for (const u of r.usulan) {
      lines.push(`- [${u.kategori}] ${u.judul}`);
      lines.push(`  Tujuan: ${u.tujuan}`);
      lines.push(`  Dampak: ${u.dampak}`);
    }
  }

  if (r.koordinasi.length) {
    lines.push("", "Catatan koordinasi alur kerja:");
    for (const k of r.koordinasi) lines.push(`- ${k}`);
  }

  if (r.newSuggestions > 0) {
    lines.push("", `${r.newSuggestions} usulan baru menunggu keputusan Anda (halaman Pertumbuhan / Approve).`);
  }
  return lines.join("\n");
}
