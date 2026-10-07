/**
 * Tipe fondasi pipeline bisnis (F0).
 *
 * Entitas bisnis (clients/projects/invoices/tickets) + mekanisme orkestrasi
 * (events, jobs, approvals) yang dipakai supervisor dan semua agent.
 */

export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";

export interface JobRecord {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface ApprovalRecord {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  requestedBy: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  expiresAt: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Handler untuk satu tipe job. */
export type JobHandler = (job: JobRecord) => Promise<JobResult>;

export interface JobResult {
  /** Ringkasan singkat untuk log/observability. */
  note?: string;
  /** Bila true, job dianggap selesai; selain itu dicoba ulang. */
  ok: boolean;
  /** Data tambahan (disimpan ke event bila ada). */
  data?: Record<string, unknown>;
}
