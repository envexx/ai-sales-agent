import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { buildGrowth } from "../improvement/repository.js";
import { textInvoke } from "../llm/index.js";
import { buildBriefingSnapshot } from "../pipeline/handlers/briefing.js";
import { listApprovals } from "../pipeline/repository.js";
import { loggerFor } from "../config/logger.js";
import { getOwnerProfile } from "./profile.js";
import { buildSupervisorReport } from "./report.js";

const log = loggerFor("supervisor:advisor");

export interface ChatMessage {
  role: "owner" | "supervisor";
  content: string;
  createdAt?: string;
}

/* ───────────────────────── chat store ───────────────────────────── */

export async function recordChat(role: ChatMessage["role"], content: string): Promise<void> {
  await query(`INSERT INTO supervisor_chat (role, content) VALUES ($1,$2)`, [role, content]);
}

export async function getChatHistory(limit = 10): Promise<ChatMessage[]> {
  const { rows } = await query<{ role: string; content: string; created_at: Date }>(
    `SELECT role, content, created_at FROM supervisor_chat ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows
    .map((r) => ({ role: r.role as ChatMessage["role"], content: r.content, createdAt: r.created_at.toISOString() }))
    .reverse();
}

/* ───────────────────────── context ─────────────────────────────── */

const inline = (record: Record<string, number>): string =>
  Object.entries(record).map(([k, v]) => `${k}: ${v}`).join(" · ") || "-";

async function buildContext(): Promise<string> {
  const [profile, snapshot, report, growth, approvals] = await Promise.all([
    getOwnerProfile(),
    buildBriefingSnapshot().catch(() => null),
    buildSupervisorReport(24).catch(() => null),
    buildGrowth(14).catch(() => null),
    listApprovals(20, "pending").catch(() => []),
  ]);

  const parts: string[] = [
    `# Bisnis\n${env.BUSINESS_NAME} — ${env.BUSINESS_DESCRIPTION}\nPerwakilan sales: ${env.SALES_REP_NAME}. Booking: ${env.BOOKING_LINK}`,
    `# Profil & tujuan owner (ini yang HARUS kamu pahami dan selaraskan)\n${profile}`,
  ];

  if (snapshot) {
    parts.push(
      `# Kondisi bisnis (24 jam)\n` +
        `Lead: ${snapshot.leads} · segmen ${inline(snapshot.segments)} · outreach ${inline(snapshot.outreach)}\n` +
        `Proyek: ${inline(snapshot.projectStages)} · approval tertunda: ${snapshot.approvalsPending} · tiket: ${inline(snapshot.ticketsOpen)}`,
    );
  }

  if (report) {
    const active = report.agents.filter((a) => a.done || a.failed || a.queued || a.running);
    parts.push(
      `# Kinerja agent (24 jam)\n` +
        (active.length
          ? active.map((a) => `- ${a.name}: selesai ${a.done}, gagal ${a.failed}, antre ${a.queued}, jalan ${a.running}`).join("\n")
          : "- (belum ada aktivitas)") +
        (report.anomalies.length ? `\nKendala: ${report.anomalies.join("; ")}` : "\nKendala: tidak ada yang menonjol."),
    );
  }

  if (growth) {
    const low = growth.agents.filter((a) => a.successRate !== null && a.successRate < 80);
    const pendingSug = growth.agents.reduce((n, a) => n + a.suggestionsPending, 0);
    parts.push(
      `# Tren pertumbuhan (${growth.days} hari)\n` +
        growth.agents
          .filter((a) => a.done + a.failed > 0)
          .map((a) => `- ${a.name}: selesai ${a.done} (tren ${a.trend >= 0 ? "+" : ""}${a.trend}), rasio ${a.successRate ?? "-"}%`)
          .join("\n") +
        `\nUsulan perbaikan menunggu: ${pendingSug}` +
        (low.length ? `\nPerlu perhatian: ${low.map((a) => `${a.name} ${a.successRate}%`).join(", ")}` : ""),
    );
  }

  if (approvals.length) {
    parts.push(`# Approval menunggu keputusan\n${approvals.map((a) => `- ${a.title}`).join("\n")}`);
  }

  return parts.join("\n\n");
}

/* ───────────────────────── advise ─────────────────────────────── */

const SYSTEM = `Kamu adalah **Supervisor V2** — penasihat strategis sekaligus penanggung jawab alur kerja seluruh agent untuk OWNER perusahaan ini.

Tugasmu:
1. Memantau semua alur kerja agent agar selaras dengan tujuan owner & bisnis.
2. Memberi saran dan kritik yang membangun kepada SETIAP agent.
3. Mengusulkan perbaikan/pembaruan/penambahan (fitur atau teknologi) kepada owner dengan **Tujuan** dan **Dampak** yang jelas.
4. Memastikan alur kerja & jalur koordinasi antar-agent tetap terstruktur.
5. Menyusun jawaban/laporan yang jelas, tidak ambigu, bahasa mudah, sedikit istilah teknis.

Aturan:
- Bahasa Indonesia, ringkas, langsung ke inti. Hindari basa-basi dan jargon (bila perlu, jelaskan singkat).
- Bersandar HANYA pada data konteks. Jangan mengarang angka/kejadian.
- Bila tujuan owner belum jelas atau informasi kurang, ajukan 1-2 pertanyaan penajam dulu.
- Saran harus bentuk langkah nyata (agent mana yang bergerak, apa yang diubah, apa ukurannya).
- Saat mengusulkan fitur/teknologi, sebutkan **Tujuan** dan **Dampak**.
- Jangan menyetujui/mengubah apa pun sendiri; keputusan tetap milik owner.`;

/** Minta saran/obrolan dari Supervisor sebagai penasihat. */
export async function adviseSupervisor(message: string): Promise<string> {
  const [context, history] = await Promise.all([buildContext(), getChatHistory(10)]);
  const transcript = history
    .map((m) => `${m.role === "owner" ? "Owner" : "Supervisor"}: ${m.content}`)
    .join("\n");

  const human = [
    context,
    transcript ? `# Percakapan sebelumnya\n${transcript}` : "",
    `# Pesan owner sekarang\n${message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let reply: string;
  try {
    reply = await textInvoke({
      system: SYSTEM,
      human,
      temperature: 0.4,
      maxTokens: 700,
      name: "SupervisorAdvisor",
      provider: "openrouter",
    });
  } catch (err) {
    log.warn({ err: (err as Error).message }, "advisor gagal");
    reply = "Maaf, saya sedang tidak bisa menganalisis sekarang (gangguan LLM). Coba lagi sebentar.";
  }

  await recordChat("owner", message).catch(() => {});
  await recordChat("supervisor", reply).catch(() => {});
  return reply.trim();
}
