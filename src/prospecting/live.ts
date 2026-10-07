import { randomUUID } from "node:crypto";
import {
  completeJob,
  failJobFinal,
  insertRunningJob,
  mergeJobPayload,
} from "../pipeline/repository.js";
import {
  runDailyProspecting,
  runProspecting,
  runTargetedProspecting,
  type DailyProspectingResult,
  type TargetedRunResult,
} from "./run.js";
import type { ProspectProgress, ProspectRunResult } from "./types.js";

/**
 * Jalankan prospecting sebagai **live run**: satu job `running` dibuat lebih dulu
 * sehingga kartunya langsung muncul di kolom "Riset" pada kanban bisnis, lalu
 * progresnya diperbarui selama proses, dan ditutup saat selesai/gagal.
 *
 * Dipakai endpoint sinkron (`POST /prospecting`, `POST /prospecting/targeted`)
 * yang sebelumnya tidak punya jejak job sama sekali.
 */

function baseProgress(niche: string, location: string): ProspectProgress {
  return {
    phase: "maps",
    niche,
    location,
    total: 0,
    processed: 0,
    enriched: 0,
    saved: 0,
    skipped: 0,
    excluded: 0,
    duplicates: 0,
  };
}

export async function runProspectingLive(input: {
  niche: string;
  location: string;
  limit?: number;
  enrich?: boolean;
  queue?: boolean;
  excludeTech?: boolean;
}): Promise<ProspectRunResult> {
  const jobId = randomUUID();
  await insertRunningJob({
    id: jobId,
    type: "prospecting.live",
    payload: {
      niche: input.niche,
      location: input.location,
      live: true,
      progress: baseProgress(input.niche, input.location),
    },
  });

  try {
    const result = await runProspecting({
      ...input,
      onProgress: (progress) => mergeJobPayload(jobId, { niche: progress.niche, progress }),
    });
    await mergeJobPayload(jobId, {
      progress: {
        ...baseProgress(input.niche, input.location),
        phase: "done",
        total: result.discovered,
        processed: result.cards.length,
        enriched: result.enriched,
        saved: result.saved,
        skipped: result.skipped,
        excluded: result.excluded,
        duplicates: result.duplicates,
      } satisfies ProspectProgress,
    });
    await completeJob(jobId);
    return result;
  } catch (err) {
    await mergeJobPayload(jobId, {
      progress: {
        ...baseProgress(input.niche, input.location),
        phase: "failed",
        message: (err as Error).message,
      } satisfies ProspectProgress,
    });
    await failJobFinal(jobId, (err as Error).message);
    throw err;
  }
}

export async function runTargetedLive(input: {
  location: string;
  count?: number;
  only?: string[];
  limit?: number;
  queue?: boolean;
}): Promise<TargetedRunResult> {
  const jobId = randomUUID();
  const title = `Riset tepat sasaran — ${input.location}`;
  await insertRunningJob({
    id: jobId,
    type: "prospecting.live",
    payload: {
      niche: title,
      location: input.location,
      live: true,
      progress: baseProgress(title, input.location),
    },
  });

  try {
    const result = await runTargetedProspecting({
      ...input,
      onProgress: (progress) => mergeJobPayload(jobId, { niche: progress.niche, progress }),
    });
    await mergeJobPayload(jobId, {
      niche: title,
      progress: {
        ...baseProgress(title, input.location),
        phase: "done",
        total: result.totals.discovered,
        processed: result.totals.discovered,
        enriched: result.totals.enriched,
        saved: result.totals.saved,
        skipped: result.totals.skipped,
        excluded: result.totals.excluded,
        duplicates: result.totals.duplicates,
      } satisfies ProspectProgress,
    });
    await completeJob(jobId);
    return result;
  } catch (err) {
    await mergeJobPayload(jobId, {
      progress: {
        ...baseProgress(title, input.location),
        phase: "failed",
        message: (err as Error).message,
      } satisfies ProspectProgress,
    });
    await failJobFinal(jobId, (err as Error).message);
    throw err;
  }
}

/**
 * Live run untuk **target harian**: satu job `running` yang progresnya diperbarui
 * saat mengelilingi niche, sampai target lead tersimpan tercapai.
 */
export async function runDailyLive(input: {
  location: string;
  target: number;
  nichesPerRound?: number;
  perNicheLimit?: number;
  maxRounds?: number;
  queue?: boolean;
}): Promise<DailyProspectingResult> {
  const jobId = randomUUID();
  const title = `Riset harian ${input.location} (target ${input.target})`;
  await insertRunningJob({
    id: jobId,
    type: "prospecting.live",
    payload: {
      niche: title,
      location: input.location,
      live: true,
      progress: baseProgress(title, input.location),
    },
  });

  try {
    const result = await runDailyProspecting({
      ...input,
      onProgress: (progress) => mergeJobPayload(jobId, { niche: progress.niche, progress }),
    });
    await mergeJobPayload(jobId, {
      niche: title,
      progress: {
        ...baseProgress(title, input.location),
        phase: "done",
        total: result.totalToday,
        processed: result.totalToday,
        saved: result.saved,
        duplicates: result.rounds.reduce((n, r) => n + r.duplicates, 0),
      } satisfies ProspectProgress,
    });
    await completeJob(jobId);
    return result;
  } catch (err) {
    await mergeJobPayload(jobId, {
      progress: {
        ...baseProgress(title, input.location),
        phase: "failed",
        message: (err as Error).message,
      } satisfies ProspectProgress,
    });
    await failJobFinal(jobId, (err as Error).message);
    throw err;
  }
}
