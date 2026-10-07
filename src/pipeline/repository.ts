import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { currentJobId } from "./auditContext.js";
import type {
  ApprovalRecord,
  ApprovalStatus,
  EventRecord,
  JobRecord,
  JobStatus,
} from "./types.js";

/* ───────────────────────────── jobs ───────────────────────────────── */

interface JobRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  run_at: Date;
  locked_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

const toJob = (r: JobRow): JobRecord => ({
  id: r.id,
  type: r.type,
  payload: r.payload ?? {},
  status: r.status as JobStatus,
  priority: r.priority,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  runAt: r.run_at.toISOString(),
  lockedAt: r.locked_at ? r.locked_at.toISOString() : null,
  lastError: r.last_error,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

/**
 * Tambahkan job ke antrean. Bila `payload.dedupeKey` diisi dan sudah ada job
 * dengan (type, dedupeKey) yang sama, tidak ada duplikat (idempoten).
 */
export async function enqueueJob(params: {
  type: string;
  payload?: Record<string, unknown>;
  runAt?: string;
  priority?: number;
  maxAttempts?: number;
}): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO jobs (id, type, payload, run_at, priority, max_attempts)
     VALUES ($1,$2,$3::jsonb,COALESCE($4::timestamptz, now()),$5,$6)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      randomUUID(),
      params.type,
      JSON.stringify({ ...params.payload, ...(currentJobId() ? { sourceJobId: currentJobId() } : {}) }),
      params.runAt ?? null,
      params.priority ?? 0,
      params.maxAttempts ?? env.PIPELINE_MAX_ATTEMPTS,
    ],
  );
  return rows[0]?.id ?? null;
}

/** Ambil job yang jatuh tempo dan kunci agar tidak diproses ganda. */
export async function claimDueJobs(limit: number): Promise<JobRecord[]> {
  const { rows } = await query<JobRow>(
    `UPDATE jobs SET status = 'running', locked_at = now(), updated_at = now(),
                     attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM jobs
       WHERE status = 'queued' AND run_at <= now()
       ORDER BY priority DESC, run_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     RETURNING *`,
    [limit],
  );
  return rows.map(toJob);
}

export async function completeJob(id: string): Promise<void> {
  await query(
    `UPDATE jobs SET status='done', last_error=NULL, updated_at=now() WHERE id=$1`,
    [id],
  );
}

/**
 * Buat job yang langsung berstatus `running` (untuk pekerjaan sinkron yang ingin
 * terlihat "live" di kanban). Karena statusnya bukan `queued`, scheduler tidak
 * akan ikut menjalankannya.
 */
export async function insertRunningJob(params: {
  id?: string;
  type: string;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const id = params.id ?? randomUUID();
  await query(
    `INSERT INTO jobs (id, type, payload, status, run_at, updated_at)
     VALUES ($1,$2,$3::jsonb,'running',now(),now())
     ON CONFLICT (id) DO UPDATE SET type=EXCLUDED.type, payload=EXCLUDED.payload, status='running', updated_at=now()`,
    [id, params.type, JSON.stringify(params.payload ?? {})],
  );
  return id;
}

/** Gabungkan patch ke payload job (dipakai untuk update progres live). */
export async function mergeJobPayload(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await query(
    `UPDATE jobs SET payload = COALESCE(payload,'{}'::jsonb) || $2::jsonb, updated_at=now() WHERE id=$1`,
    [id, JSON.stringify(patch)],
  );
}

/** Tandai job gagal secara final (tanpa dijadwalkan ulang). */
export async function failJobFinal(id: string, error: string): Promise<void> {
  await query(
    `UPDATE jobs SET status='failed', last_error=$2, locked_at=NULL, updated_at=now() WHERE id=$1`,
    [id, error.slice(0, 1000)],
  );
}

/**
 * Tangani job yang macet `running` (mis. karena proses ter-restart saat job
 * berjalan): job **yang punya handler** dikembalikan ke antrean untuk diproses
 * ulang; sisanya (mis. job "live" tanpa handler) ditandai `failed` agar tidak
 * ikut dijalankan ulang oleh scheduler.
 */
export async function requeueRunningJobs(handlerTypes?: string[]): Promise<number> {
  const { rowCount } = await query(
    `UPDATE jobs SET
       status = CASE WHEN ($1::text[] IS NULL OR type = ANY($1)) THEN 'queued' ELSE 'failed' END,
       last_error = CASE WHEN ($1::text[] IS NULL OR type = ANY($1)) THEN last_error ELSE 'interrupted (restart)' END,
       locked_at = NULL,
       updated_at = now()
     WHERE status='running'`,
    [handlerTypes ?? null],
  );
  return rowCount ?? 0;
}

/** Tandai gagal; jadwalkan ulang bila masih ada sisa attempt. */
export async function failJob(id: string, error: string, retryInSeconds = 60): Promise<void> {
  await query(
    `UPDATE jobs SET
       status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
       last_error = $2,
       run_at = CASE WHEN attempts >= max_attempts THEN run_at
                     ELSE now() + ($3 || ' seconds')::interval END,
       locked_at = NULL,
       updated_at = now()
     WHERE id = $1`,
    [id, error.slice(0, 1000), String(retryInSeconds)],
  );
}

export async function listJobs(limit = 50, types?: string[], ids?: string[]): Promise<JobRecord[]> {
  const { rows } = await query<JobRow>(
    `SELECT * FROM jobs WHERE ($2::text[] IS NULL OR type = ANY($2)) AND ($3::text[] IS NULL OR id = ANY($3)) ORDER BY created_at DESC LIMIT $1`,
    [limit, types ?? null, ids ?? null],
  );
  return rows.map(toJob);
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const { rows } = await query<JobRow>(`SELECT * FROM jobs WHERE id=$1`, [id]);
  return rows[0] ? toJob(rows[0]) : null;
}

/* ───────────────────────────── events ─────────────────────────────── */

export async function insertEvent(params: {
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO events (type, entity_type, entity_id, payload)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [
      params.type,
      params.entityType ?? null,
      params.entityId ?? null,
      JSON.stringify(params.payload ?? {}),
    ],
  );
}

export async function listEvents(limit = 100, types?: string[]): Promise<EventRecord[]> {
  const { rows } = await query<{
    id: string;
    type: string;
    entity_type: string | null;
    entity_id: string | null;
    payload: Record<string, unknown>;
    created_at: Date;
  }>(`SELECT id::text, type, entity_type, entity_id, payload, created_at
      FROM events WHERE ($2::text[] IS NULL OR type = ANY($2))
      ORDER BY events.id DESC LIMIT $1`, [limit, types ?? null]);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    payload: r.payload ?? {},
    createdAt: r.created_at.toISOString(),
  }));
}

/* ──────────────────────────── approvals ───────────────────────────── */

interface ApprovalRow {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  status: string;
  requested_by: string | null;
  decided_by: string | null;
  decision_note: string | null;
  expires_at: Date | null;
  created_at: Date;
  decided_at: Date | null;
}

const toApproval = (r: ApprovalRow): ApprovalRecord => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  summary: r.summary,
  payload: r.payload ?? {},
  status: r.status as ApprovalStatus,
  requestedBy: r.requested_by,
  decidedBy: r.decided_by,
  decisionNote: r.decision_note,
  expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
  createdAt: r.created_at.toISOString(),
  decidedAt: r.decided_at ? r.decided_at.toISOString() : null,
});

export async function insertApproval(params: {
  id?: string;
  kind: string;
  title: string;
  summary?: string | null;
  payload?: Record<string, unknown>;
  requestedBy?: string | null;
  expiresAt?: string | null;
}): Promise<ApprovalRecord> {
  const { rows } = await query<ApprovalRow>(
    `INSERT INTO approvals (id, kind, title, summary, payload, requested_by, expires_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
     RETURNING *`,
    [
      params.id ?? randomUUID(),
      params.kind,
      params.title,
      params.summary ?? null,
      JSON.stringify(params.payload ?? {}),
      params.requestedBy ?? null,
      params.expiresAt ?? null,
    ],
  );
  return toApproval(rows[0]!);
}

export async function decideApproval(params: {
  id: string;
  status: Extract<ApprovalStatus, "approved" | "rejected">;
  decidedBy?: string | null;
  note?: string | null;
}): Promise<ApprovalRecord | null> {
  const { rows } = await query<ApprovalRow>(
    `UPDATE approvals
       SET status=$2, decided_by=$3, decision_note=$4, decided_at=now()
     WHERE id=$1 AND status='pending'
     RETURNING *`,
    [params.id, params.status, params.decidedBy ?? null, params.note ?? null],
  );
  return rows[0] ? toApproval(rows[0]) : null;
}

export async function getApproval(id: string): Promise<ApprovalRecord | null> {
  const { rows } = await query<ApprovalRow>(`SELECT * FROM approvals WHERE id=$1`, [id]);
  return rows[0] ? toApproval(rows[0]) : null;
}

export async function listApprovals(
  limit = 50,
  status?: ApprovalStatus,
): Promise<ApprovalRecord[]> {
  const { rows } = status
    ? await query<ApprovalRow>(
        `SELECT * FROM approvals WHERE status=$2 ORDER BY created_at DESC LIMIT $1`,
        [limit, status],
      )
    : await query<ApprovalRow>(
        `SELECT * FROM approvals ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
  return rows.map(toApproval);
}
