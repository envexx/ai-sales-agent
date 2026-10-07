import { randomUUID } from "node:crypto";
import { query } from "../db/pool.js";
import type { DevTargetRecord } from "./types.js";

/**
 * Repository target developer (`dev_targets`) — situs/repo/otomasi yang dikelola
 * agent Developer. Satu proyek umumnya punya satu target aktif.
 */

interface DevTargetRow {
  id: string;
  project_id: string | null;
  client_id: string | null;
  kind: string;
  name: string;
  repo_url: string | null;
  live_url: string | null;
  local_path: string | null;
  platform: string | null;
  status: string;
  meta: Record<string, unknown>;
  last_audit_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const toTarget = (r: DevTargetRow): DevTargetRecord => ({
  id: r.id,
  projectId: r.project_id,
  clientId: r.client_id,
  kind: r.kind,
  name: r.name,
  repoUrl: r.repo_url,
  liveUrl: r.live_url,
  localPath: r.local_path,
  platform: r.platform,
  status: r.status,
  meta: r.meta ?? {},
  lastAuditAt: r.last_audit_at ? r.last_audit_at.toISOString() : null,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

export async function createDevTarget(params: {
  id?: string;
  projectId?: string | null;
  clientId?: string | null;
  kind?: string;
  name: string;
  repoUrl?: string | null;
  liveUrl?: string | null;
  localPath?: string | null;
  platform?: string | null;
  status?: string;
  meta?: Record<string, unknown>;
}): Promise<DevTargetRecord> {
  const { rows } = await query<DevTargetRow>(
    `INSERT INTO dev_targets (id, project_id, client_id, kind, name, repo_url, live_url, local_path, platform, status, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     RETURNING *`,
    [
      params.id ?? randomUUID(),
      params.projectId ?? null,
      params.clientId ?? null,
      params.kind ?? "site",
      params.name,
      params.repoUrl ?? null,
      params.liveUrl ?? null,
      params.localPath ?? null,
      params.platform ?? null,
      params.status ?? "active",
      JSON.stringify(params.meta ?? {}),
    ],
  );
  return toTarget(rows[0]!);
}

export async function listDevTargets(status?: string, limit = 200): Promise<DevTargetRecord[]> {
  const { rows } = await query<DevTargetRow>(
    `SELECT * FROM dev_targets
     WHERE ($2::text IS NULL OR status = $2)
     ORDER BY updated_at DESC LIMIT $1`,
    [limit, status ?? null],
  );
  return rows.map(toTarget);
}

export async function getDevTarget(id: string): Promise<DevTargetRecord | null> {
  const { rows } = await query<DevTargetRow>(`SELECT * FROM dev_targets WHERE id=$1`, [id]);
  return rows[0] ? toTarget(rows[0]) : null;
}

export async function findDevTargetByProject(projectId: string): Promise<DevTargetRecord | null> {
  const { rows } = await query<DevTargetRow>(
    `SELECT * FROM dev_targets WHERE project_id=$1 AND status <> 'archived'
     ORDER BY created_at DESC LIMIT 1`,
    [projectId],
  );
  return rows[0] ? toTarget(rows[0]) : null;
}

export async function updateDevTarget(params: {
  id: string;
  status?: string;
  repoUrl?: string | null;
  liveUrl?: string | null;
  localPath?: string | null;
  platform?: string | null;
  lastAuditAt?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `UPDATE dev_targets SET
       status        = COALESCE($2, status),
       repo_url      = COALESCE($3, repo_url),
       live_url      = COALESCE($4, live_url),
       local_path    = COALESCE($5, local_path),
       platform      = COALESCE($6, platform),
       last_audit_at = COALESCE($7::timestamptz, last_audit_at),
       meta          = COALESCE(meta, '{}'::jsonb) || COALESCE($8::jsonb, '{}'::jsonb),
       updated_at    = now()
     WHERE id = $1`,
    [
      params.id,
      params.status ?? null,
      params.repoUrl ?? null,
      params.liveUrl ?? null,
      params.localPath ?? null,
      params.platform ?? null,
      params.lastAuditAt ?? null,
      params.meta ? JSON.stringify(params.meta) : null,
    ],
  );
}
