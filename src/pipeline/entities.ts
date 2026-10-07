import { randomUUID, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { query } from "../db/pool.js";

/** Query ringan entitas bisnis yang dipakai briefing & agen hilir. */

export interface ProjectRecord {
  id: string;
  clientId: string | null;
  title: string;
  stage: string;
  prdPath: string | null;
  workspace: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Siapkan struktur folder workspace proyek agar tidak berantakan
 * (lihat docs/FLOW.md § Manajemen workspace).
 */
export async function ensureProjectWorkspace(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  await Promise.all(
    ["meetings", "legal", "intake", "docs", "qa", "handover", "content"].map((sub) =>
      mkdir(resolve(dir, sub), { recursive: true }),
    ),
  );
  return dir;
}

export async function createProject(params: {
  id?: string;
  clientId?: string | null;
  title: string;
  stage?: string;
  prdPath?: string | null;
  workspace?: string | null;
  meta?: Record<string, unknown>;
}): Promise<string> {
  const id = params.id ?? randomUUID();
  await query(
    `INSERT INTO projects (id, client_id, title, stage, prd_path, workspace, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      id,
      params.clientId ?? null,
      params.title,
      params.stage ?? "scoping",
      params.prdPath ?? null,
      params.workspace ?? null,
      JSON.stringify(params.meta ?? {}),
    ],
  );
  return id;
}

export async function listProjects(limit = 100): Promise<ProjectRecord[]> {
  const { rows } = await query<{
    id: string;
    client_id: string | null;
    title: string;
    stage: string;
    prd_path: string | null;
    workspace: string | null;
    meta: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
  }>(`SELECT * FROM projects ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    title: r.title,
    stage: r.stage,
    prdPath: r.prd_path,
    workspace: r.workspace,
    meta: r.meta ?? {},
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function countProjectsByStage(): Promise<Record<string, number>> {
  const { rows } = await query<{ key: string; count: number }>(
    `SELECT stage AS key, count(*)::int AS count FROM projects GROUP BY 1`,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.count]));
}

export async function countOpenTicketsBySeverity(): Promise<Record<string, number>> {
  const { rows } = await query<{ key: string; count: number }>(
    `SELECT severity AS key, count(*)::int AS count
     FROM tickets WHERE status <> 'resolved' GROUP BY 1`,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.count]));
}

/* ───────────────────────────── clients ───────────────────────────── */

export interface ClientRecord {
  id: string;
  leadId: string | null;
  name: string;
  company: string | null;
  waJid: string | null;
  email: string | null;
  status: string;
  meta: Record<string, unknown>;
}

/** Cari klien berdasarkan lead atau nomor WhatsApp; buat bila belum ada. */
export async function upsertClient(params: {
  leadId?: string | null;
  waJid?: string | null;
  name: string;
  company?: string | null;
  email?: string | null;
}): Promise<ClientRecord> {
  const existing = await query<{
    id: string;
    lead_id: string | null;
    name: string;
    company: string | null;
    wa_jid: string | null;
    email: string | null;
    status: string;
    meta: Record<string, unknown>;
  }>(
    `SELECT * FROM clients
     WHERE ($1::text IS NOT NULL AND lead_id = $1)
        OR ($2::text IS NOT NULL AND wa_jid = $2)
     LIMIT 1`,
    [params.leadId ?? null, params.waJid ?? null],
  );

  if (existing.rows[0]) {
    const r = existing.rows[0];
    return {
      id: r.id,
      leadId: r.lead_id,
      name: r.name,
      company: r.company,
      waJid: r.wa_jid,
      email: r.email,
      status: r.status,
      meta: r.meta ?? {},
    };
  }

  const id = randomUUID();
  const { rows } = await query<{
    id: string;
    lead_id: string | null;
    name: string;
    company: string | null;
    wa_jid: string | null;
    email: string | null;
    status: string;
    meta: Record<string, unknown>;
  }>(
    `INSERT INTO clients (id, lead_id, name, company, wa_jid, email)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      id,
      params.leadId ?? null,
      params.name,
      params.company ?? null,
      params.waJid ?? null,
      params.email ?? null,
    ],
  );
  const r = rows[0]!;
  return {
    id: r.id,
    leadId: r.lead_id,
    name: r.name,
    company: r.company,
    waJid: r.wa_jid,
    email: r.email,
    status: r.status,
    meta: r.meta ?? {},
  };
}

export async function updateProject(params: {
  id: string;
  stage?: string;
  prdPath?: string | null;
  workspace?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `UPDATE projects SET
       stage     = COALESCE($2, stage),
       prd_path  = COALESCE($3, prd_path),
       workspace = COALESCE($4, workspace),
       meta      = COALESCE(meta, '{}'::jsonb) || COALESCE($5::jsonb, '{}'::jsonb),
       updated_at = now()
     WHERE id = $1`,
    [
      params.id,
      params.stage ?? null,
      params.prdPath ?? null,
      params.workspace ?? null,
      params.meta ? JSON.stringify(params.meta) : null,
    ],
  );
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  const { rows } = await query<{
    id: string;
    client_id: string | null;
    title: string;
    stage: string;
    prd_path: string | null;
    workspace: string | null;
    meta: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
  }>(`SELECT * FROM projects WHERE id = $1`, [id]);
  const r = rows[0];
  return r
    ? {
        id: r.id,
        clientId: r.client_id,
        title: r.title,
        stage: r.stage,
        prdPath: r.prd_path,
        workspace: r.workspace,
        meta: r.meta ?? {},
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      }
    : null;
}

export async function getClient(id: string): Promise<ClientRecord | null> {
  const { rows } = await query<{
    id: string;
    lead_id: string | null;
    name: string;
    company: string | null;
    wa_jid: string | null;
    email: string | null;
    status: string;
    meta: Record<string, unknown>;
  }>(`SELECT * FROM clients WHERE id = $1`, [id]);
  const r = rows[0];
  return r
    ? {
        id: r.id,
        leadId: r.lead_id,
        name: r.name,
        company: r.company,
        waJid: r.wa_jid,
        email: r.email,
        status: r.status,
        meta: r.meta ?? {},
      }
    : null;
}

/* ───────────────────────────── invoices ──────────────────────────── */

export interface InvoiceRecord {
  id: string;
  clientId: string | null;
  projectId: string | null;
  kind: string;
  amount: number;
  currency: string;
  status: string;
  dueAt: string | null;
  paidAt: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface InvoiceRow {
  id: string;
  client_id: string | null;
  project_id: string | null;
  kind: string;
  amount: string | number;
  currency: string;
  status: string;
  due_at: Date | null;
  paid_at: Date | null;
  payload: Record<string, unknown>;
  created_at: Date;
}

const toInvoice = (r: InvoiceRow): InvoiceRecord => ({
  id: r.id,
  clientId: r.client_id,
  projectId: r.project_id,
  kind: r.kind,
  amount: Number(r.amount),
  currency: r.currency,
  status: r.status,
  dueAt: r.due_at ? r.due_at.toISOString() : null,
  paidAt: r.paid_at ? r.paid_at.toISOString() : null,
  payload: r.payload ?? {},
  createdAt: r.created_at.toISOString(),
});

export async function createInvoice(params: {
  id?: string;
  clientId?: string | null;
  projectId?: string | null;
  kind?: string;
  amount: number;
  currency?: string;
  status?: string;
  dueAt?: string | null;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const id = params.id ?? randomUUID();
  await query(
    `INSERT INTO invoices (id, client_id, project_id, kind, amount, currency, status, due_at, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [
      id,
      params.clientId ?? null,
      params.projectId ?? null,
      params.kind ?? "dp",
      params.amount,
      params.currency ?? "IDR",
      params.status ?? "draft",
      params.dueAt ?? null,
      JSON.stringify(params.payload ?? {}),
    ],
  );
  return id;
}

export async function markInvoicePaid(id: string): Promise<InvoiceRecord | null> {
  const { rows } = await query<InvoiceRow>(
    `UPDATE invoices SET status='paid', paid_at=now(), updated_at=now()
     WHERE id=$1 AND status <> 'paid' RETURNING *`,
    [id],
  );
  return rows[0] ? toInvoice(rows[0]) : null;
}

export async function listInvoicesByProject(projectId: string): Promise<InvoiceRecord[]> {
  const { rows } = await query<InvoiceRow>(
    `SELECT * FROM invoices WHERE project_id=$1 ORDER BY created_at DESC`,
    [projectId],
  );
  return rows.map(toInvoice);
}

export async function listInvoices(limit = 100): Promise<InvoiceRecord[]> {
  const { rows } = await query<InvoiceRow>(
    `SELECT * FROM invoices ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toInvoice);
}

/* ──────────────────────────── credentials ────────────────────────── */

export interface CredentialMeta {
  id: string;
  clientId: string | null;
  projectId: string | null;
  name: string;
  hint: string | null;
  createdAt: string;
}

export async function saveCredential(params: {
  projectId?: string | null;
  clientId?: string | null;
  name: string;
  value: string;
  hint?: string | null;
}): Promise<string> {
  const { encryptSecret } = await import("../util/crypto.js");
  const id = randomUUID();
  await query(
    `INSERT INTO credentials (id, client_id, project_id, name, cipher, hint)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      params.clientId ?? null,
      params.projectId ?? null,
      params.name,
      encryptSecret(params.value),
      params.hint ?? null,
    ],
  );
  return id;
}

export async function listCredentials(projectId: string): Promise<CredentialMeta[]> {
  const { rows } = await query<{
    id: string;
    client_id: string | null;
    project_id: string | null;
    name: string;
    hint: string | null;
    created_at: Date;
  }>(
    `SELECT id, client_id, project_id, name, hint, created_at
     FROM credentials WHERE project_id=$1 ORDER BY created_at DESC`,
    [projectId],
  );
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    projectId: r.project_id,
    name: r.name,
    hint: r.hint,
    createdAt: r.created_at.toISOString(),
  }));
}

/** Ambil nilai kredensial (terdekripsi). Gunakan dengan hati-hati. */
export async function revealCredential(id: string): Promise<string | null> {
  const { decryptSecret } = await import("../util/crypto.js");
  const { rows } = await query<{ cipher: string }>(
    `SELECT cipher FROM credentials WHERE id=$1`,
    [id],
  );
  return rows[0] ? decryptSecret(rows[0].cipher) : null;
}

/* ────────────────────────────── tickets ──────────────────────────── */

export interface TicketRecord {
  id: string;
  clientId: string | null;
  projectId: string | null;
  channel: string | null;
  severity: string;
  status: string;
  subject: string | null;
  body: string | null;
  resolution: string | null;
  createdAt: string;
}

export async function createTicket(params: {
  clientId?: string | null;
  projectId?: string | null;
  channel?: string | null;
  severity?: string;
  status?: string;
  subject: string;
  body?: string | null;
  resolution?: string | null;
}): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO tickets (id, client_id, project_id, channel, severity, status, subject, body, resolution)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      params.clientId ?? null,
      params.projectId ?? null,
      params.channel ?? "whatsapp",
      params.severity ?? "l1",
      params.status ?? "open",
      params.subject,
      params.body ?? null,
      params.resolution ?? null,
    ],
  );
  return id;
}

export async function listTickets(limit = 100): Promise<TicketRecord[]> {
  const { rows } = await query<{
    id: string;
    client_id: string | null;
    project_id: string | null;
    channel: string | null;
    severity: string;
    status: string;
    subject: string | null;
    body: string | null;
    resolution: string | null;
    created_at: Date;
  }>(`SELECT * FROM tickets ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    projectId: r.project_id,
    channel: r.channel,
    severity: r.severity,
    status: r.status,
    subject: r.subject,
    body: r.body,
    resolution: r.resolution,
    createdAt: r.created_at.toISOString(),
  }));
}

/* ─────────────────────────── client channels ─────────────────────── */

export interface ChannelRecord {
  id: string;
  channel: string;
  externalId: string;
  clientId: string | null;
  projectId: string | null;
  label: string | null;
  createdAt: string;
}

export async function linkChannel(params: {
  channel: string;
  externalId: string;
  clientId?: string | null;
  projectId: string;
  label?: string | null;
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO client_channels (id, channel, external_id, client_id, project_id, label)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (channel, external_id) DO UPDATE
       SET project_id = EXCLUDED.project_id,
           client_id  = COALESCE(EXCLUDED.client_id, client_channels.client_id),
           label      = COALESCE(EXCLUDED.label, client_channels.label)
     RETURNING id`,
    [
      randomUUID(),
      params.channel,
      params.externalId,
      params.clientId ?? null,
      params.projectId,
      params.label ?? null,
    ],
  );
  return rows[0]!.id;
}

export async function getChannel(
  channel: string,
  externalId: string,
): Promise<ChannelRecord | null> {
  const { rows } = await query<{
    id: string;
    channel: string;
    external_id: string;
    client_id: string | null;
    project_id: string | null;
    label: string | null;
    created_at: Date;
  }>(
    `SELECT * FROM client_channels WHERE channel=$1 AND external_id=$2 LIMIT 1`,
    [channel, externalId],
  );
  const r = rows[0];
  return r
    ? {
        id: r.id,
        channel: r.channel,
        externalId: r.external_id,
        clientId: r.client_id,
        projectId: r.project_id,
        label: r.label,
        createdAt: r.created_at.toISOString(),
      }
    : null;
}

export async function listChannels(limit = 100): Promise<ChannelRecord[]> {
  const { rows } = await query<{
    id: string;
    channel: string;
    external_id: string;
    client_id: string | null;
    project_id: string | null;
    label: string | null;
    created_at: Date;
  }>(`SELECT * FROM client_channels ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    externalId: r.external_id,
    clientId: r.client_id,
    projectId: r.project_id,
    label: r.label,
    createdAt: r.created_at.toISOString(),
  }));
}

/* ───────────────────────── intake links (F0.6) ───────────────────── */

export interface IntakeLinkRecord {
  id: string;
  token: string;
  projectId: string;
  status: string;
  items: unknown[];
  expiresAt: string;
  submittedAt: string | null;
}

interface IntakeLinkRow {
  id: string;
  token: string;
  project_id: string;
  status: string;
  items: unknown[];
  expires_at: Date;
  submitted_at: Date | null;
}

const toIntakeLink = (r: IntakeLinkRow): IntakeLinkRecord => ({
  id: r.id,
  token: r.token,
  projectId: r.project_id,
  status: r.status,
  items: Array.isArray(r.items) ? r.items : [],
  expiresAt: r.expires_at.toISOString(),
  submittedAt: r.submitted_at ? r.submitted_at.toISOString() : null,
});

export async function createIntakeLink(params: {
  projectId: string;
  items: unknown[];
  ttlHours: number;
}): Promise<IntakeLinkRecord> {
  const id = randomUUID();
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + params.ttlHours * 3_600_000);
  const { rows } = await query<IntakeLinkRow>(
    `INSERT INTO intake_links (id, token, project_id, items, expires_at)
     VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING *`,
    [id, token, params.projectId, JSON.stringify(params.items), expiresAt],
  );
  return toIntakeLink(rows[0]!);
}

export async function getIntakeLinkByToken(token: string): Promise<IntakeLinkRecord | null> {
  const { rows } = await query<IntakeLinkRow>(
    `SELECT * FROM intake_links WHERE token = $1 LIMIT 1`,
    [token],
  );
  return rows[0] ? toIntakeLink(rows[0]) : null;
}

export async function markIntakeSubmitted(token: string): Promise<void> {
  await query(
    `UPDATE intake_links SET status='submitted', submitted_at=now() WHERE token=$1`,
    [token],
  );
}

/** Tandai link kedaluwarsa. Mengembalikan jumlah yang diubah. */
export async function expireIntakeLinks(): Promise<number> {
  const { rowCount } = await query(
    `UPDATE intake_links SET status='expired'
     WHERE status='pending' AND expires_at < now()`,
  );
  return rowCount ?? 0;
}

/** Proyek aktif dari seorang lead (via client → project). */
export async function findProjectIdForLead(leadId: string): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    `SELECT p.id FROM projects p
     JOIN clients c ON c.id = p.client_id
     WHERE c.lead_id = $1
     ORDER BY p.created_at DESC LIMIT 1`,
    [leadId],
  );
  return rows[0]?.id ?? null;
}
