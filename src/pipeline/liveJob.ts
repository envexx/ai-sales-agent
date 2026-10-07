import { randomUUID } from "node:crypto";
import {
  completeJob,
  failJobFinal,
  insertRunningJob,
  mergeJobPayload,
} from "./repository.js";

export interface LiveJobHandle {
  jobId: string;
  /** Gabungkan patch ke payload job (mis. progres). */
  update: (patch: Record<string, unknown>) => Promise<void>;
}

/**
 * Jalankan pekerjaan agent sebagai **job `running`** agar kartunya langsung
 * tampil "live" di kanban selama proses berjalan (tanpa menunggu selesai).
 *
 * Job ditutup otomatis: `done` bila sukses, `failed` bila error. Karena
 * statusnya bukan `queued`, scheduler tidak akan ikut menjalankannya.
 *
 * `payload` sebaiknya memuat `leadId`/`projectId` agar kartu terhubung ke
 * record yang benar pada Business Kanban.
 */
export async function runTrackedJob<T>(
  params: { type: string; payload?: Record<string, unknown> },
  run: (job: LiveJobHandle) => Promise<T>,
): Promise<T> {
  const jobId = randomUUID();
  await insertRunningJob({
    id: jobId,
    type: params.type,
    payload: { ...(params.payload ?? {}), live: true },
  });
  const handle: LiveJobHandle = {
    jobId,
    update: (patch) => mergeJobPayload(jobId, patch),
  };
  try {
    const result = await run(handle);
    await completeJob(jobId);
    return result;
  } catch (err) {
    await failJobFinal(jobId, (err as Error).message);
    throw err;
  }
}
