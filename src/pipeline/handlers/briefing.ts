import { env } from "../../config/env.js";
import { notifyOwner } from "../../notifications/index.js";
import {
  getMetrics,
  getOutreachStats,
  listResearchReports,
} from "../../repository/index.js";
import { countOpenTicketsBySeverity, countProjectsByStage } from "../entities.js";
import { emitEvent } from "../events.js";
import { enqueueJob, listApprovals } from "../repository.js";import type { JobHandler, JobResult } from "../types.js";
import { z } from "zod";
import { buildSupervisorReport, type SupervisorReport } from "../../supervisor/report.js";
import { structuredInvoke } from "../../llm/index.js";

/* ───────────────────────── jadwal harian ─────────────────────────── */

function tzParts(
  date: Date,
  tz: string,
): { hour: number; minute: number; dateKey: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) parts[part.type] = part.value;
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Waktu briefing berikutnya (jam `hour` pada zona `tz`). */
export function nextBriefingAt(hour: number, tz: string, from = new Date()): Date {
  const probe = new Date(from.getTime());
  probe.setSeconds(0, 0);
  for (let i = 0; i < 48 * 60; i++) {
    probe.setTime(probe.getTime() + 60_000);
    const p = tzParts(probe, tz);
    if (p.hour === hour && p.minute === 0) return new Date(probe.getTime());
  }
  return new Date(from.getTime() + 24 * 3_600_000);
}

/** Jadwalkan briefing harian berikutnya (idempoten per tanggal). */
export async function scheduleNextBriefing(): Promise<string | null> {
  if (!env.BRIEFING_ENABLED) return null;
  const target = nextBriefingAt(env.BRIEFING_HOUR, env.BRIEFING_TIMEZONE);
  const dateKey = tzParts(target, env.BRIEFING_TIMEZONE).dateKey;
  return enqueueJob({
    type: "briefing",
    runAt: target.toISOString(),
    payload: { dedupeKey: `briefing:${dateKey}` },
  });
}

/* ─────────────────────────── snapshot ────────────────────────────── */

export interface BriefingSnapshot {
  generatedAt: string;
  leads: number;
  conversations: number;
  segments: Record<string, number>;
  outreach: Record<string, number>;
  researchReports: number;
  researchLast24h: number;
  projectStages: Record<string, number>;
  approvalsPending: number;
  ticketsOpen: Record<string, number>;
  llmProvider: string;
  dryRun: boolean;
  transport: string;
}

export async function buildBriefingSnapshot(): Promise<BriefingSnapshot> {
  const [metrics, outreach, approvals, projectStages, tickets, reports] = await Promise.all([
    getMetrics(),
    getOutreachStats(),
    listApprovals(50, "pending"),
    countProjectsByStage(),
    countOpenTicketsBySeverity(),
    listResearchReports(200),
  ]);

  const dayAgo = Date.now() - 24 * 3_600_000;
  return {
    generatedAt: new Date().toISOString(),
    leads: metrics.totals.leads,
    conversations: metrics.totals.conversations,
    segments: metrics.segments,
    outreach,
    researchReports: reports.length,
    researchLast24h: reports.filter((r) => Date.parse(r.createdAt) >= dayAgo).length,
    projectStages,
    approvalsPending: approvals.length,
    ticketsOpen: tickets,
    llmProvider: env.LLM_PROVIDER,
    dryRun: env.DRY_RUN,
    transport: env.WA_TRANSPORT,
  };
}

const inline = (record: Record<string, number>): string =>
  Object.entries(record)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ") || "-";

/** Baris aktivitas per agent (apa yang sudah dikerjakan). */
function agentActivityLines(report: SupervisorReport): string[] {
  const lines = report.agents
    .filter((a) => a.done || a.failed || a.running || a.queued || a.lastEventType)
    .map((a) => {
      const bits: string[] = [];
      if (a.done) bits.push(`${a.done} selesai`);
      if (a.running) bits.push(`${a.running} sedang jalan`);
      if (a.queued) bits.push(`${a.queued} menunggu`);
      if (a.failed) bits.push(`${a.failed} gagal`);
      if (a.approvalsPending) bits.push(`${a.approvalsPending} approval`);
      const tail = a.lastEventType ? ` · terakhir: ${a.lastEventType}` : "";
      return `- ${a.name}: ${bits.join(", ") || "tidak ada aktivitas"}${tail}`;
    });
  return lines.length ? lines : ["- (belum ada aktivitas agent dalam 24 jam terakhir)"];
}

/** Saran tindakan singkat (LLM; fallback heuristik dari kendala). */
async function suggestActions(
  snapshot: BriefingSnapshot,
  report: SupervisorReport,
): Promise<string[]> {
  try {
    const out = await structuredInvoke({
      schema: z.object({ suggestions: z.array(z.string()).max(4) }),
      system:
        "Kamu Supervisor operasional sebuah sistem banyak agent. Beri 2-4 saran tindakan singkat (Bahasa Indonesia) " +
        "untuk owner berdasarkan laporan. Fokus hal yang bisa ditindak hari ini. Jangan mengarang data di luar laporan.",
      human: [
        `Ringkasan: ${snapshot.leads} lead · outreach ${inline(snapshot.outreach)} · approval tertunda ${snapshot.approvalsPending}`,
        `Kendala: ${report.anomalies.join("; ") || "(tidak ada yang menonjol)"}`,
        "Aktivitas agent:",
        ...agentActivityLines(report),
      ].join("\n"),
      name: "SupervisorBriefing",
      temperature: 0.2,
    });
    return out.suggestions.map((s) => s.trim()).filter(Boolean).slice(0, 4);
  } catch {
    const out: string[] = [];
    for (const a of report.anomalies) {
      if (a.includes("menunggu Scout"))
        out.push("Naikkan kuota Scout atau jalankan scout lebih awal agar prospek cepat siap di-Sales.");
      else if (a.includes("approval")) out.push("Buka halaman Approval dan putuskan item yang menunggu.");
      else if (a.includes("gagal")) out.push("Periksa job yang gagal di Aktivitas/Pipeline, lalu jalankan ulang bila perlu.");
      else if (a.includes("done_review")) out.push("Tinjau proyek yang telat di tahap dokumen (done_review).");
    }
    return [...new Set(out)].slice(0, 4);
  }
}

export function formatBriefing(
  s: BriefingSnapshot,
  report?: SupervisorReport,
  suggestions?: string[],
): string {
  const lines = [
    `Pipeline: ${s.leads} lead · segmen ${inline(s.segments)}`,
    `Outreach: ${inline(s.outreach)}`,
    `Riset: ${s.researchReports} laporan (24 jam: ${s.researchLast24h})`,
    `Proyek: ${inline(s.projectStages)}`,
    `Approval tertunda: ${s.approvalsPending}`,
    `Tiket terbuka: ${inline(s.ticketsOpen)}`,
    `Sistem: transport ${s.transport} · dryRun ${s.dryRun} · LLM ${s.llmProvider}`,
  ];

  if (report) {
    lines.push("", "Aktivitas agent (24 jam terakhir):", ...agentActivityLines(report));
    lines.push(
      "",
      report.anomalies.length
        ? `Kendala / perlu tindakan:\n- ${report.anomalies.join("\n- ")}`
        : "Kendala: tidak ada yang menonjol.",
    );
  }

  if (suggestions && suggestions.length) {
    lines.push("", `Saran Supervisor:\n- ${suggestions.join("\n- ")}`);
  }

  lines.push(
    "",
    "Catatan: Supervisor hanya meninjau & menyarankan — keputusan (approval) tetap milik Anda.",
  );
  return lines.join("\n");
}

/**
 * Handler job `briefing`: kirim ringkasan harian (aktivitas agent + kendala +
 * saran) ke owner lalu jadwalkan briefing berikutnya.
 */
export const briefingHandler: JobHandler = async (): Promise<JobResult> => {
  const snapshot = await buildBriefingSnapshot();
  const report = await buildSupervisorReport(24).catch(() => undefined);
  const suggestions = report ? await suggestActions(snapshot, report) : [];
  const dateKey = tzParts(new Date(), env.BRIEFING_TIMEZONE).dateKey;
  const result = await notifyOwner({
    title: `Daily Briefing — ${dateKey}`,
    body: formatBriefing(snapshot, report, suggestions),
  });

  await emitEvent("briefing.sent", {
    payload: { ...snapshot, anomalies: report?.anomalies ?? [], suggestions, notified: result.sent },
  });
  await scheduleNextBriefing();
  // Sekaligus jalankan pemeriksaan infra harian + tinjauan supervisor.
  await enqueueJob({ type: "monitor.check", payload: { dedupeKey: `monitor:${dateKey}` } });
  await enqueueJob({ type: "supervisor.review", payload: { dedupeKey: `supervisor:${dateKey}` } });

  return {
    ok: true,
    note: result.sent ? "briefing terkirim" : `briefing dibuat (${result.reason})`,
    data: { notified: result.sent, suggestions: suggestions.length },
  };
};
