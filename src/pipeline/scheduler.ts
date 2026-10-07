import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { registerCoreJobHandlers, scheduleNextBriefing } from "./handlers/index.js";
import { processDueJobs } from "./jobs.js";
import { registeredJobTypes } from "./registry.js";
import { requeueRunningJobs } from "./repository.js";
import { scheduleDaily } from "./schedule.js";

const log = loggerFor("pipeline:scheduler");

let timer: NodeJS.Timeout | null = null;
let busy = false;

/**
 * Scheduler pipeline: memproses job yang jatuh tempo secara berkala.
 * Pola ini sama dengan scheduler outreach — berjalan di dalam aplikasi.
 */
export function startPipelineScheduler(): void {
  if (!env.PIPELINE_ENABLED) {
    log.info("pipeline scheduler nonaktif (PIPELINE_ENABLED=false)");
    return;
  }

  registerCoreJobHandlers();

  // Recovery: job yang macet `running` (mis. proses ter-restart) dikembalikan ke antrean.
  void requeueRunningJobs(registeredJobTypes())
    .then((count) => {
      if (count > 0) log.info({ count }, "job running macet dikembalikan ke antrean");
    })
    .catch((err) => log.error({ err: (err as Error).message }, "gagal recovery job running"));

  void scheduleNextBriefing()
    .then((id) => {
      if (id) log.info({ jobId: id }, "briefing harian terjadwal");
    })
    .catch((err) =>
      log.error({ err: (err as Error).message }, "gagal menjadwalkan briefing"),
    );

  // F0.3: kuota harian Prospecting & Scout.
  if (env.PROSPECTING_ENABLED) {
    void scheduleDaily({
      type: "prospecting.daily",
      hour: env.PROSPECTING_HOUR,
      dedupePrefix: "prospecting-daily",
    })
      .then((id) => {
        if (id) log.info({ jobId: id }, "prospecting harian terjadwal");
      })
      .catch((err) =>
        log.error({ err: (err as Error).message }, "gagal menjadwalkan prospecting"),
      );
  }
  void scheduleDaily({
    type: "scout.daily",
    hour: env.SCOUT_HOUR,
    dedupePrefix: "scout-daily",
  })
    .then((id) => {
      if (id) log.info({ jobId: id }, "scout harian terjadwal");
    })
    .catch((err) =>
      log.error({ err: (err as Error).message }, "gagal menjadwalkan scout"),
    );

  // Loop perbaikan agent (harian, sebelum briefing).
  if (env.AGENT_OPTIMIZE_ENABLED) {
    void scheduleDaily({
      type: "agent.optimize",
      hour: env.AGENT_OPTIMIZE_HOUR,
      dedupePrefix: "agent-optimize",
    })
      .then((id) => {
        if (id) log.info({ jobId: id }, "agent.optimize terjadwal");
      })
      .catch((err) =>
        log.error({ err: (err as Error).message }, "gagal menjadwalkan agent.optimize"),
      );
  }

  // D4 · Developer: audit berkala situs/repo terpasang (harian).
  if (env.DEVELOPER_SWEEP_ENABLED) {
    void scheduleDaily({
      type: "developer.sweep",
      hour: env.DEVELOPER_SWEEP_HOUR,
      dedupePrefix: "developer-sweep",
    })
      .then((id) => {
        if (id) log.info({ jobId: id }, "developer.sweep terjadwal");
      })
      .catch((err) =>
        log.error({ err: (err as Error).message }, "gagal menjadwalkan developer.sweep"),
      );
  }

  // F0.6: bersihkan link intake kedaluwarsa (harian dini hari).
  void scheduleDaily({ type: "intake.expire", hour: 3, dedupePrefix: "intake-expire" })
    .then((id) => {
      if (id) log.info({ jobId: id }, "intake.expire terjadwal");
    })
    .catch((err) =>
      log.error({ err: (err as Error).message }, "gagal menjadwalkan intake.expire"),
    );

  timer = setInterval(() => void tick(), env.PIPELINE_TICK_SECONDS * 1000);
  log.info({ everySeconds: env.PIPELINE_TICK_SECONDS }, "pipeline scheduler aktif");
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const { processed } = await processDueJobs();
    if (processed > 0) log.info({ processed }, "job pipeline diproses");
  } catch (err) {
    log.error({ err: (err as Error).message }, "tick pipeline gagal");
  } finally {
    busy = false;
  }
}

export function stopPipelineScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
