import { loggerFor } from "../config/logger.js";
import { insertEvent } from "./repository.js";
import { currentJobId } from "./auditContext.js";

const log = loggerFor("pipeline:events");

/**
 * Catat event bisnis (outbox/observability). Tidak pernah melempar — kegagalan
 * mencatat event tidak boleh menggagalkan alur utama.
 */
export async function emitEvent(
  type: string,
  opts: {
    entityType?: string | null;
    entityId?: string | null;
    payload?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const jobId = currentJobId();
    await insertEvent({ type, ...opts, payload: { ...opts.payload, ...(jobId ? { jobId } : {}) } });
    log.debug({ type, entityId: opts.entityId ?? null }, "event");
  } catch (err) {
    log.warn({ type, err: (err as Error).message }, "gagal menyimpan event");
  }
}
