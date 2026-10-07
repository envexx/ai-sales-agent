import { loggerFor } from "../config/logger.js";
import { notifyOwner } from "../notifications/index.js";
import { getProject, updateProject } from "./entities.js";
import { emitEvent } from "./events.js";
import { enqueueJob } from "./repository.js";

const log = loggerFor("pipeline:flow");

/**
 * Tandai sistem selesai dibangun lalu jadwalkan QA.
 *
 * Ini jembatan "TITIK KERJA ANDA": setelah Anda membangun sistem klien dari
 * PRD + kredensial, panggil ini (API/ perintah owner `BUILT`) agar rantai
 * F3–F4 berjalan otomatis:
 *
 *   markSystemBuilt → qa.run → (lulus) scribe.docs → handover.finalize
 */
export async function markSystemBuilt(params: {
  projectId: string;
  webhookUrl?: string;
  expectedJson?: string;
}): Promise<string | null> {
  const project = await getProject(params.projectId);
  if (!project) throw new Error(`project ${params.projectId} tidak ditemukan`);

  await updateProject({
    id: params.projectId,
    stage: "done_review",
    meta: { builtAt: new Date().toISOString() },
  });

  await emitEvent("project.built", {
    entityType: "project",
    entityId: params.projectId,
    payload: { webhookUrl: params.webhookUrl ?? null },
  });

  const jobId = await enqueueJob({
    type: "qa.run",
    payload: {
      projectId: params.projectId,
      webhookUrl: params.webhookUrl,
      expectedJson: params.expectedJson,
    },
  });

  await notifyOwner({
    title: "Sistem siap diuji (QA)",
    body: `Proyek ${params.projectId.slice(0, 8)} ditandai "built". QA dijadwalkan.`,
  });

  log.info({ projectId: params.projectId, jobId }, "system built → QA dijadwalkan");
  return jobId;
}
