import { runProspecting, runDailyProspecting } from "../../prospecting/run.js";
import { runAgentOptimize } from "../../improvement/optimize.js";
import { runScoper } from "../../scoper/run.js";
import { askClarification } from "../../scoper/clarify.js";
import { runLegal } from "../../legal/run.js";
import { runIntake } from "../../intake/run.js";
import { runQa } from "../../qa/run.js";
import { runScribe } from "../../scribe/run.js";
import { runHandover } from "../../handover/run.js";
import { runSupport } from "../../support/run.js";
import { runMonitor } from "../../monitor/run.js";
import { runDeveloperApply, runDeveloperBuild, runDeveloperDeploy, runDeveloperMaintain, runDeveloperSweep } from "../../developer/run.js";
import { runCaseStudy } from "../../content/run.js";
import { scoutAudit } from "../../scout/index.js";
import { notifyOwner } from "../../notifications/index.js";
import { formatSupervisorReview, runSupervisorReview } from "../../supervisor/review.js";
import { env } from "../../config/env.js";
import { query } from "../../db/pool.js";
import { expireIntakeLinks } from "../entities.js";
import { listLeadsByReadiness } from "../../repository/index.js";
import { enqueueJob } from "../repository.js";
import { scheduleDaily } from "../schedule.js";
import { registerJobHandler } from "../registry.js";
import { briefingHandler } from "./briefing.js";

/**
 * Daftarkan semua handler job inti (semua agent F0–F5).
 *
 * Rantai event utama:
 *   prospecting.completed → prospect.discovered → scout.audit
 *   deal won → scoper.prd → legal.draft → (dp paid) → intake.collect
 *   (system built) → qa.run → (lulus) → scribe.docs → handover.finalize
 *   (final paid) → content.case_study + developer.maintain
 *   harian → briefing (+ monitor.check + developer.sweep)
 */
export function registerCoreJobHandlers(): void {
  registerJobHandler("briefing", briefingHandler);

  // Loop perbaikan agent: usulan konkret dari kinerja + pelajaran.
  registerJobHandler("agent.optimize", async () => {
    const r = await runAgentOptimize();
    return { ok: true, note: `optimize ${r.generated} agent`, data: { agents: r.agents } };
  });

  // D0 · Supervisor V2: pantau alur kerja semua agent, beri saran/kritik per agent,
  // usulkan perbaikan/pembaruan (fitur/teknologi) dengan Tujuan & Dampak → owner.
  registerJobHandler("supervisor.review", async () => {
    const review = await runSupervisorReview();
    await notifyOwner({
      title: "Supervisor V2 — tinjauan harian",
      body: formatSupervisorReview(review),
    });
    return {
      ok: true,
      note: `tinjauan: ${review.perAgent} agent, ${review.usulan.length} usulan, ${review.newSuggestions} usulan baru`,
      data: {
        perAgent: review.perAgent,
        usulan: review.usulan.length,
        newSuggestions: review.newSuggestions,
        anomalies: review.anomalies.length,
      },
    };
  });

  /* D1 · Growth & Acquisition */
  registerJobHandler("prospecting.scan", async (job) => {
    const p = job.payload as { niche?: string; location?: string; limit?: number };
    if (!p.niche || !p.location) return { ok: false, note: "niche & location wajib" };
    const r = await runProspecting({ niche: p.niche, location: p.location, limit: p.limit });
    await notifyOwner({
      title: `Prospecting selesai: ${p.niche} di ${p.location}`,
      body: `Ditemukan ${r.discovered}, tersimpan ${r.saved}, dilewati ${r.skipped} (duplikat ${r.duplicates}).`,
    });
    return { ok: true, note: `prospecting ${r.saved}/${r.discovered}`, data: { id: r.id } };
  });
  registerJobHandler("scout.audit", scoutAudit);

  // D1 · Kuota harian (F0.3): Prospecting hari-1 100 → harian 5; Scout 15/hari.
  registerJobHandler("prospecting.daily", async () => {
    const niche = env.PROSPECTING_NICHE;
    const location = env.PROSPECTING_LOCATION;
    if (!location) {
      await notifyOwner({
        title: "Prospecting harian dilewati",
        body: "Set PROSPECTING_LOCATION (dan opsional PROSPECTING_NICHE) di .env agar job harian berjalan.",
      });
      return { ok: true, note: "lokasi belum dikonfigurasi" };
    }
    const { rows } = await query<{ c: number }>(
      `SELECT count(*)::int AS c FROM events WHERE type IN ('prospecting.completed','prospecting.targeted_completed')`,
    );
    const quota =
      (rows[0]?.c ?? 0) > 0 ? env.PROSPECTING_DAILY_QUOTA : env.PROSPECTING_DAY1_QUOTA;
    await scheduleDaily({
      type: "prospecting.daily",
      hour: env.PROSPECTING_HOUR,
      dedupePrefix: "prospecting-daily",
    });

    // Tanpa niche eksplisit → mode tepat sasaran: kejar target lead harian.
    if (!niche) {
      const t = await runDailyProspecting({
        location,
        target: env.PROSPECTING_DAILY_TARGET,
        nichesPerRound: env.PROSPECTING_NICHES_PER_ROUND,
        perNicheLimit: env.PROSPECTING_DEFAULT_LIMIT,
        maxRounds: env.PROSPECTING_MAX_ROUNDS,
        queue: true,
      });
      await notifyOwner({
        title: `Prospecting harian ${location}: ${t.totalToday}/${t.target} target`,
        body:
          `Baru tersimpan ${t.saved} (total hari ini ${t.totalToday}/${t.target}) · ` +
          `duplikat dilewati ${t.rounds.reduce((n, r) => n + r.duplicates, 0)}.\n` +
          `Putaran: ${t.rounds.map((r) => `${r.verticals.join(" / ")} → ${r.saved}`).join("; ") || "-"}.`,
      });
      return {
        ok: true,
        note: `harian ${t.totalToday}/${t.target}`,
        data: { saved: t.saved, totalToday: t.totalToday, target: t.target },
      };
    }

    const r = await runProspecting({ niche, location, limit: quota });
    await notifyOwner({
      title: `Prospecting selesai: ${niche} di ${location}`,
      body: `Ditemukan ${r.discovered}, tersimpan ${r.saved}, dilewati ${r.skipped} (duplikat ${r.duplicates}).`,
    });
    return {
      ok: true,
      note: `prospecting ${r.saved}/${r.discovered} (kuota ${quota})`,
      data: { id: r.id, saved: r.saved },
    };
  });

  registerJobHandler("scout.daily", async () => {
    const leads = await listLeadsByReadiness("discovered", env.SCOUT_DAILY_QUOTA);
    for (const lead of leads) {
      const p = (lead.meta as { prospect?: Record<string, unknown> }).prospect ?? {};
      await enqueueJob({
        type: "scout.audit",
        payload: {
          leadId: lead.id,
          name: lead.name,
          company: lead.company,
          website: p.website ?? null,
          rating: p.rating ?? null,
          reviews: p.reviews ?? null,
          category: p.category ?? null,
          niche: p.niche ?? null,
          location: p.location ?? null,
        },
      });
    }
    await scheduleDaily({
      type: "scout.daily",
      hour: env.SCOUT_HOUR,
      dedupePrefix: "scout-daily",
    });
    return { ok: true, note: `scout harian: ${leads.length} lead dijadwalkan`, data: { scheduled: leads.length } };
  });

  /* F2 · Deal Desk */
  registerJobHandler("scoper.prd", async (job) => {
    const p = job.payload as { leadId?: string; threadId?: string; title?: string; path?: "demo" | "meeting"; projectId?: string };
    if (!p.leadId && !p.threadId) return { ok: false, note: "leadId atau threadId wajib" };
    const r = await runScoper({ leadId: p.leadId, threadId: p.threadId, title: p.title, path: p.path, projectId: p.projectId });
    await notifyOwner({
      title: `PRD siap: ${r.title}`,
      body: `${r.prd.requirements.length} kebutuhan · ${r.openQuestions.length} pertanyaan terbuka.\nFile: ${r.prdPath}`,
    });
    return { ok: true, note: `PRD dibuat`, data: { projectId: r.projectId } };
  });

  // Loop pertanyaan terbuka: Sales menanyakan ke klien (dipicu Scoper).
  registerJobHandler("sales.clarify", askClarification);

  registerJobHandler("legal.draft", async (job) => {
    const p = job.payload as { projectId?: string; amount?: number };
    if (!p.projectId) return { ok: false, note: "projectId wajib" };
    const r = await runLegal({ projectId: p.projectId, amount: p.amount });
    return { ok: true, note: "legal dibuat", data: { invoiceId: r.invoiceId } };
  });

  registerJobHandler("intake.collect", async (job) => {
    const p = job.payload as { projectId?: string };
    if (!p.projectId) return { ok: false, note: "projectId wajib" };
    const r = await runIntake(p.projectId);
    return { ok: true, note: `intake ${r.items.length} item`, data: { formPath: r.formPath, url: r.url } };
  });

  // F0.6: tutup link intake yang kedaluwarsa.
  registerJobHandler("intake.expire", async () => {
    const n = await expireIntakeLinks();
    return { ok: true, note: `${n} link intake kedaluwarsa`, data: { expired: n } };
  });

  /* F3 · Delivery & Quality */
  registerJobHandler("qa.run", async (job) => {
    const p = job.payload as { projectId?: string; webhookUrl?: string; expectedJson?: string };
    if (!p.projectId) return { ok: false, note: "projectId wajib" };
    const r = await runQa({ projectId: p.projectId, webhookUrl: p.webhookUrl, expectedJson: p.expectedJson });
    // QA "fail" adalah hasil yang sah (bukan kegagalan job) — jangan di-retry.
    return { ok: true, note: `QA ${r.passed ? "pass" : "fail"} (${r.score}/10)`, data: { passed: r.passed, score: r.score } };
  });

  registerJobHandler("scribe.docs", async (job) => {
    const p = job.payload as { projectId?: string };
    if (!p.projectId) return { ok: false, note: "projectId wajib" };
    const r = await runScribe(p.projectId);
    return { ok: true, note: `docs ${r.steps} langkah`, data: { sopPath: r.sopPath } };
  });

  /* F4 · Client Success */
  registerJobHandler("handover.finalize", async (job) => {
    const p = job.payload as { projectId?: string; totalAmount?: number };
    if (!p.projectId) return { ok: false, note: "projectId wajib" };
    const r = await runHandover({ projectId: p.projectId, totalAmount: p.totalAmount });
    return { ok: true, note: `handover siap`, data: { approvalId: r.approvalId } };
  });

  registerJobHandler("support.triage", async (job) => {
    const p = job.payload as {
      message?: string;
      clientId?: string;
      projectId?: string;
      channel?: string;
    };
    if (!p.message) return { ok: false, note: "message wajib" };
    const r = await runSupport({
      message: p.message,
      clientId: p.clientId,
      projectId: p.projectId,
      channel: p.channel,
    });
    return { ok: true, note: `support ${r.category}`, data: { ticketId: r.ticketId, escalated: r.escalated } };
  });

  registerJobHandler("monitor.check", async () => {
    const r = await runMonitor();
    return { ok: true, note: `monitor ${r.alerts.length} alert`, data: r.metrics };
  });

  registerJobHandler("developer.maintain", async (job) => {
    const p = job.payload as { projectId?: string };
    if (!p.projectId) return { ok: false, note: "projectId wajib" };
    const r = await runDeveloperMaintain(p.projectId);
    return {
      ok: true,
      note: `rencana developer siap (${r.plan.items.length} langkah)`,
      data: { targetId: r.targetId, approvalId: r.approvalId },
    };
  });

  registerJobHandler("developer.build", async (job) => {
    const p = job.payload as { title?: string; brief?: string; projectId?: string; targetId?: string; repoUrl?: string; scope?: "internal" | "client" };
    if (!p.title || !p.brief) return { ok: false, note: "title & brief wajib" };
    const r = await runDeveloperBuild({
      title: p.title,
      brief: p.brief,
      projectId: p.projectId,
      targetId: p.targetId,
      repoUrl: p.repoUrl,
      scope: p.scope,
    });
    return { ok: true, note: `rencana build siap`, data: { targetId: r.targetId, approvalId: r.approvalId, enqueuedApply: r.enqueuedApply } };
  });

  registerJobHandler("developer.sweep", async () => {
    const r = await runDeveloperSweep();
    return { ok: true, note: `sweep: ${r.scheduled}/${r.targets} target dijadwalkan`, data: r };
  });

  registerJobHandler("developer.apply", async (job) => {
    const p = job.payload as { targetId?: string; projectId?: string | null; planPath?: string; mode?: string };
    if (!p.targetId) return { ok: false, note: "targetId wajib" };
    const r = await runDeveloperApply(p);
    return { ok: true, note: r.prUrl ? `PR: ${r.prUrl}` : "perubahan diterapkan", data: { ...r } };
  });

  registerJobHandler("developer.deploy", async (job) => {
    const p = job.payload as { targetId?: string; platform?: string };
    if (!p.targetId) return { ok: false, note: "targetId wajib" };
    const r = await runDeveloperDeploy(p);
    return { ok: true, note: r.note, data: { ...r } };
  });

  /* F5 · Flywheel */
  registerJobHandler("content.case_study", async (job) => {
    const p = job.payload as { projectId?: string; results?: string[] };
    if (!p.projectId) return { ok: false, note: "projectId wajib" };
    const r = await runCaseStudy({ projectId: p.projectId, results: p.results });
    return {
      ok: true,
      note: `case study: ${r.headline}${r.ingested ? " (+knowledge)" : ""}`,
      data: { path: r.path, ingested: r.ingested },
    };
  });
}

export {
  briefingHandler,
  buildBriefingSnapshot,
  formatBriefing,
  nextBriefingAt,
  scheduleNextBriefing,
} from "./briefing.js";
