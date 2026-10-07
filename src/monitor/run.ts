import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { buildGrowth } from "../improvement/repository.js";
import { notifyOwner } from "../notifications/index.js";
import { countOpenTicketsBySeverity } from "../pipeline/entities.js";
import { emitEvent } from "../pipeline/events.js";
import { listApprovals, listJobs } from "../pipeline/repository.js";

const log = loggerFor("monitor");

export interface MonitorResult {
  alerts: string[];
  metrics: Record<string, unknown>;
}

/**
 * Infrastructure, Cost & Agent-Performance Monitor (F4 — fungsi ganda).
 *
 * Pemeriksaan berkala (job `monitor.check`):
 * 1. **Infra/biaya** — memori proses, job gagal, tiket darurat, approval tertunda.
 * 2. **Kinerja agent** — job gagal per agent, rasio sukses rendah, antrean
 *    menumpuk, dan usulan perbaikan yang belum diputuskan (loop perbaikan).
 * Mengirim peringatan ke owner bila ada masalah.
 */
export async function runMonitor(): Promise<MonitorResult> {
  if (!env.MONITOR_ENABLED) throw new Error("Monitor nonaktif (MONITOR_ENABLED=false)");

  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / (1024 * 1024));

  const [tickets, jobs, approvals, growth] = await Promise.all([
    countOpenTicketsBySeverity(),
    listJobs(200),
    listApprovals(100, "pending"),
    buildGrowth(14),
  ]);

  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const queuedJobs = jobs.filter((j) => j.status === "queued").length;
  const emergencyTickets = tickets.emergency ?? 0;

  // ── 1) Infra / biaya ──
  const infraAlerts: string[] = [];
  if (rssMb > env.MONITOR_MEMORY_MB)
    infraAlerts.push(`Memori proses tinggi: ${rssMb} MB (> ${env.MONITOR_MEMORY_MB} MB)`);
  if (failedJobs > 0) infraAlerts.push(`${failedJobs} job gagal`);
  if (emergencyTickets > 0) infraAlerts.push(`${emergencyTickets} tiket darurat terbuka`);

  // ── 2) Kinerja agent (loop perbaikan) ──
  const perfAlerts: string[] = [];
  const failing = growth.agents.filter((a) => a.failed > 0);
  if (failing.length)
    perfAlerts.push(`Agent job gagal: ${failing.map((a) => `${a.name} (${a.failed})`).join(", ")}`);
  const low = growth.agents.filter(
    (a) => a.successRate !== null && a.successRate < 70 && a.done + a.failed >= 5,
  );
  if (low.length)
    perfAlerts.push(`Rasio sukses rendah: ${low.map((a) => `${a.name} ${a.successRate}%`).join(", ")}`);
  const backlog = growth.agents.filter((a) => a.queued > 20);
  if (backlog.length)
    perfAlerts.push(`Antrean menumpuk: ${backlog.map((a) => `${a.name} ${a.queued}`).join(", ")}`);

  const suggestionsPending = growth.agents.reduce((n, a) => n + a.suggestionsPending, 0);
  if (suggestionsPending > 0)
    perfAlerts.push(`${suggestionsPending} usulan perbaikan agent menunggu keputusan Anda`);

  const alerts = [...infraAlerts, ...perfAlerts];

  const metrics = {
    rssMb,
    uptimeSec: Math.round(process.uptime()),
    queuedJobs,
    failedJobs,
    pendingApprovals: approvals.length,
    tickets,
    llmProvider: env.LLM_PROVIDER,
    dryRun: env.DRY_RUN,
    // Kinerja agent (fungsi ganda)
    agentsTracked: growth.agents.length,
    agentsWithFailures: failing.length,
    suggestionsPending,
    lowSuccessAgents: low.map((a) => ({ agent: a.slug, successRate: a.successRate })),
    at: new Date().toISOString(),
  };

  await emitEvent("monitor.check", {
    payload: { ...metrics, alerts: alerts.length, infraAlerts: infraAlerts.length, perfAlerts: perfAlerts.length },
  });
  if (alerts.length > 0) {
    await emitEvent("monitor.alert", { payload: { alerts } });
    await notifyOwner({
      title: `⚠️ Peringatan monitor (${alerts.length})`,
      body:
        (infraAlerts.length ? `Infra:\n- ${infraAlerts.join("\n- ")}\n\n` : "") +
        (perfAlerts.length ? `Kinerja agent:\n- ${perfAlerts.join("\n- ")}` : ""),
    });
  }

  log.info(
    { alerts: alerts.length, infra: infraAlerts.length, perf: perfAlerts.length, rssMb },
    "monitor check",
  );
  return { alerts, metrics };
}
