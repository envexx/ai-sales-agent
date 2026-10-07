import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { emitEvent } from "./events.js";
import { claimDueJobs, completeJob, enqueueJob, failJob } from "./repository.js";
import { getJobHandler } from "./registry.js";
import { AGENT_REGISTRY } from "./agentRegistry.js";
import { recordImprovement } from "../improvement/repository.js";
import type { JobRecord } from "./types.js";
import { withJobAudit } from "./auditContext.js";

const log = loggerFor("pipeline:jobs");

export { enqueueJob };

/** Agent pemilik sebuah tipe job (untuk atribusi pelajaran). */
function agentForJob(type: string): string | null {
  return AGENT_REGISTRY.find((agent) => agent.jobTypes.includes(type))?.slug ?? null;
}

/** Catat pelajaran singkat hasil satu job (dipakai loop pembelajaran). */
async function recordJobLesson(job: JobRecord, ok: boolean, note: string): Promise<void> {
  const agent = agentForJob(job.type);
  if (!agent) return;
  await recordImprovement({
    agent,
    kind: "lesson",
    title: `${job.type} ${ok ? "selesai" : "gagal"}`,
    detail: note || (ok ? "berhasil" : "gagal tanpa catatan"),
    evidence: { jobId: job.id, ok, type: job.type },
  }).catch(() => {});
}

/** Proses semua job yang jatuh tempo (dipanggil scheduler / endpoint tick). */
export async function processDueJobs(): Promise<{ processed: number }> {
  const jobs = await claimDueJobs(env.PIPELINE_BATCH);
  for (const job of jobs) await runJob(job);
  return { processed: jobs.length };
}

async function runJob(job: JobRecord): Promise<void> {
  return withJobAudit(job.id, () => executeJob(job));
}

async function executeJob(job: JobRecord): Promise<void> {
  const handler = getJobHandler(job.type);
  if (!handler) {
    log.warn({ type: job.type }, "job handler tidak terdaftar");
    await failJob(job.id, `handler not registered: ${job.type}`, 600);
    return;
  }

  try {
    const result = await handler(job);
    if (result.ok) {
      await completeJob(job.id);
      await emitEvent("job.done", {
        entityType: "job",
        entityId: job.id,
        payload: { type: job.type, note: result.note, ...result.data },
      });
      log.info({ type: job.type, note: result.note }, "job selesai");
      await recordJobLesson(job, true, result.note ?? "ok");
    } else {
      await failJob(job.id, result.note ?? "handler returned not-ok");
      log.warn({ type: job.type, note: result.note }, "job gagal (akan dicoba ulang)");
      await recordJobLesson(job, false, result.note ?? "not ok");
    }
  } catch (err) {
    const message = (err as Error).message;
    await failJob(job.id, message);
    await emitEvent("job.error", {
      entityType: "job",
      entityId: job.id,
      payload: { type: job.type, error: message },
    });
    log.error({ type: job.type, err: message }, "job error");
    await recordJobLesson(job, false, message);
  }
}
