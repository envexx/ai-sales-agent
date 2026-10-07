import { randomUUID } from "node:crypto";
import { query } from "../db/pool.js";
import type {
  BookingInfo,
  Evaluation,
  LeadRecord,
  LeadSegment,
  Reflection,
} from "../types.js";
import type { ResearchBrief, ResearchReportRecord } from "../research/types.js";

interface LeadRow {
  id: string;
  wa_jid: string;
  name: string | null;
  stage: string;
  score: number;
  segment: string | null;
  first_seen: Date;
  last_seen: Date;
  meta: Record<string, unknown>;
  kind: string | null;
  company: string | null;
  source: string | null;
  notes: string | null;
  outreach_status: string | null;
  outreach_attempts: number | null;
  last_outreach_at: Date | null;
  next_follow_up_at: Date | null;
  opt_out: boolean | null;
  readiness: string | null;
}

const toLead = (r: LeadRow): LeadRecord => ({
  id: r.id,
  waJid: r.wa_jid,
  name: r.name,
  stage: r.stage,
  score: r.score,
  segment: (r.segment as LeadSegment | null) ?? null,
  firstSeen: r.first_seen.toISOString(),
  lastSeen: r.last_seen.toISOString(),
  meta: r.meta ?? {},
  kind: (r.kind as "inbound" | "prospect" | null) ?? "inbound",
  company: r.company ?? null,
  source: r.source ?? null,
  notes: r.notes ?? null,
  outreachStatus: r.outreach_status ?? "none",
  outreachAttempts: r.outreach_attempts ?? 0,
  lastOutreachAt: r.last_outreach_at ? r.last_outreach_at.toISOString() : null,
  nextFollowUpAt: r.next_follow_up_at ? r.next_follow_up_at.toISOString() : null,
  optOut: r.opt_out ?? false,
  readiness: r.readiness ?? "discovered",
});

/* ────────────────────────────── leads ─────────────────────────────── */

export async function upsertLeadContact(params: {
  waJid: string;
  name?: string | null;
}): Promise<LeadRecord> {
  const { rows } = await query<LeadRow>(
    `INSERT INTO leads (id, wa_jid, name, kind, readiness, last_seen)
     VALUES ($1, $2, $3, 'inbound', 'scouted_ready', now())
     ON CONFLICT (wa_jid) DO UPDATE
       SET last_seen = now(),
           name = COALESCE(EXCLUDED.name, leads.name),
           -- lead inbound yang menulis ke kita selalu siap (tidak kena gate outreach)
           readiness = CASE WHEN leads.readiness = 'discovered'
                            THEN 'scouted_ready' ELSE leads.readiness END,
           -- an inbound reply to an outbound message counts as "replied"
           outreach_status = CASE
             WHEN leads.outreach_status IN ('pending','messaged','follow_up')
               THEN 'replied'
             ELSE leads.outreach_status
           END,
           next_follow_up_at = CASE
             WHEN leads.outreach_status IN ('pending','messaged','follow_up')
               THEN NULL
             ELSE leads.next_follow_up_at
           END
     RETURNING *`,
    [randomUUID(), params.waJid, params.name ?? null],
  );
  return toLead(rows[0]!);
}

export async function getLeadById(id: string): Promise<LeadRecord | null> {
  const { rows } = await query<LeadRow>(`SELECT * FROM leads WHERE id = $1`, [id]);
  return rows[0] ? toLead(rows[0]) : null;
}

export async function getLeadByJid(waJid: string): Promise<LeadRecord | null> {
  const { rows } = await query<LeadRow>(`SELECT * FROM leads WHERE wa_jid = $1`, [
    waJid,
  ]);
  return rows[0] ? toLead(rows[0]) : null;
}

/**
 * Satukan lead lama (mis. JID `@lid`) ke lead tujuan: pindahkan percakapan
 * (+ evaluasi/booking bila ada) lalu hapus lead lama. Dipakai agar balasan yang
 * datang via LinkedID menyatu dengan lead nomor tempat kita meng-outreach.
 */
export async function mergeLeadByJid(oldJid: string, targetLeadId: string): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM leads WHERE wa_jid = $1 LIMIT 1`,
    [oldJid],
  );
  const oldId = rows[0]?.id;
  if (!oldId || oldId === targetLeadId) return;

  await query(`UPDATE conversations SET lead_id = $1 WHERE lead_id = $2`, [targetLeadId, oldId]);
  for (const table of ["evaluations", "bookings", "meeting_notes"]) {
    await query(`UPDATE ${table} SET lead_id = $1 WHERE lead_id = $2`, [
      targetLeadId,
      oldId,
    ]).catch(() => {});
  }
  await query(`DELETE FROM leads WHERE id = $1`, [oldId]);
}

export async function updateLead(params: {
  id: string;
  name?: string | null;
  stage?: string;
  score?: number;
  segment?: LeadSegment | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `UPDATE leads SET
       name    = COALESCE($2, name),
       stage   = COALESCE($3, stage),
       score   = COALESCE($4, score),
       segment = COALESCE($5, segment),
       meta    = COALESCE(meta, '{}'::jsonb) || COALESCE($6::jsonb, '{}'::jsonb),
       last_seen = now()
     WHERE id = $1`,
    [
      params.id,
      params.name ?? null,
      params.stage ?? null,
      params.score ?? null,
      params.segment ?? null,
      params.meta ? JSON.stringify(params.meta) : null,
    ],
  );
}

export async function listLeads(limit = 50, offset = 0): Promise<LeadRecord[]> {
  const { rows } = await query<LeadRow>(
    `SELECT * FROM leads ORDER BY last_seen DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows.map(toLead);
}

/** Lead prospek dengan status kesiapan tertentu (untuk gate/kuota harian). */
export async function listLeadsByReadiness(
  readiness: string,
  limit: number,
): Promise<LeadRecord[]> {
  const { rows } = await query<LeadRow>(
    `SELECT * FROM leads
     WHERE kind = 'prospect' AND readiness = $1 AND opt_out = false
     ORDER BY first_seen ASC LIMIT $2`,
    [readiness, limit],
  );
  return rows.map(toLead);
}

/** Jumlah prospek (`kind='prospect'`) tersimpan sejak waktu tertentu (opsional per lokasi). */
export async function countProspectsSince(
  sinceIso: string,
  location?: string,
): Promise<number> {
  const { rows } = await query<{ c: number }>(
    `SELECT count(*)::int AS c FROM leads
     WHERE kind = 'prospect' AND first_seen >= $1
       AND ($2::text IS NULL OR meta->'prospect'->>'location' = $2)`,
    [sinceIso, location ?? null],
  );
  return rows[0]?.c ?? 0;
}

/* ───────────────────── prospects & outreach ──────────────────────── */

export async function upsertProspect(params: {
  waJid: string;
  name?: string | null;
  company?: string | null;
  source?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  /** false = store only, do not queue for outbound. */
  queue?: boolean;
}): Promise<LeadRecord> {
  const outreachStatus = params.queue === false ? "none" : "pending";
  const nextFollowUpAt = params.queue === false ? null : new Date().toISOString();
  const meta = JSON.stringify({ tags: params.tags ?? [] });
  const { rows } = await query<LeadRow>(
    `INSERT INTO leads
       (id, wa_jid, name, company, source, notes, meta, kind, stage,
        outreach_status, next_follow_up_at, last_seen)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'prospect','new',$8,$9, now())
     ON CONFLICT (wa_jid) DO UPDATE
       SET name    = COALESCE(EXCLUDED.name, leads.name),
           company = COALESCE(EXCLUDED.company, leads.company),
           source  = COALESCE(EXCLUDED.source, leads.source),
           notes   = COALESCE(EXCLUDED.notes, leads.notes),
           meta    = COALESCE(leads.meta, '{}'::jsonb) || COALESCE(EXCLUDED.meta, '{}'::jsonb),
           kind    = 'prospect',
           outreach_status = CASE
             WHEN leads.outreach_status = 'none'
              AND EXCLUDED.outreach_status = 'pending'
               THEN 'pending'
             ELSE leads.outreach_status
           END,
           next_follow_up_at = COALESCE(leads.next_follow_up_at, EXCLUDED.next_follow_up_at)
     RETURNING *`,
    [
      randomUUID(),
      params.waJid,
      params.name ?? null,
      params.company ?? null,
      params.source ?? null,
      params.notes ?? null,
      meta,
      outreachStatus,
      nextFollowUpAt,
    ],
  );
  return toLead(rows[0]!);
}

/** Kunci pembanding nama/alamat (huruf kecil, tanpa tanda baca). */
function businessKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return key.length >= 4 ? key : null;
}

/** Host domain dari URL situs (untuk pencocokan bisnis yang sama). */
function websiteHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Cari prospek/lead yang **bisnisnya sama** meski nomornya berbeda:
 * cocokkan nama (ternormalisasi) + alamat ATAU domain situs.
 *
 * Sengaja hanya mencocokkan bila ada alamat atau situs (bukan nama saja) agar
 * tidak salah menandai cabang berbeda sebagai duplikat.
 */
export async function findProspectByBusiness(params: {
  company?: string | null;
  address?: string | null;
  website?: string | null;
}): Promise<LeadRecord | null> {
  const name = businessKey(params.company);
  const address = businessKey(params.address);
  const host = websiteHost(params.website);
  if (!name || (!address && !host)) return null;

  const { rows } = await query<LeadRow>(
    `SELECT * FROM leads
     WHERE regexp_replace(lower(coalesce(company,'')), '[^a-z0-9]+', '', 'g') = $1
       AND (
         ($2::text IS NOT NULL
           AND regexp_replace(lower(coalesce(meta->'prospect'->>'address','')), '[^a-z0-9]+', '', 'g') = $2)
         OR ($3::text IS NOT NULL
           AND lower(coalesce(meta->'prospect'->>'website','')) LIKE '%' || $3 || '%')
       )
     ORDER BY first_seen ASC
     LIMIT 1`,
    [name, address, host],
  );
  return rows[0] ? toLead(rows[0]) : null;
}

export async function listProspects(limit = 100): Promise<LeadRecord[]> {
  const { rows } = await query<LeadRow>(
    `SELECT * FROM leads WHERE kind = 'prospect'
     ORDER BY COALESCE(next_follow_up_at, first_seen) DESC LIMIT $1`,
    [limit],
  );
  return rows.map(toLead);
}

/** Prospects that are due for an outbound message right now. */
export async function listOutreachCandidates(params: {
  limit: number;
  maxAttempts: number;
}): Promise<LeadRecord[]> {
  const { rows } = await query<LeadRow>(
    `SELECT * FROM leads
     WHERE kind = 'prospect'
       AND opt_out = false
       AND readiness = 'scouted_ready'
       AND outreach_status IN ('pending','follow_up')
       AND outreach_attempts < $1
       AND (next_follow_up_at IS NULL OR next_follow_up_at <= now())
     ORDER BY COALESCE(next_follow_up_at, first_seen) ASC
     LIMIT $2`,
    [params.maxAttempts, params.limit],
  );
  return rows.map(toLead);
}

export async function recordOutreach(params: {
  lead: LeadRecord;
  attempt: number;
  kind: "opening" | "follow_up";
  message: string;
  status: "sent" | "failed" | "dry_run";
  error?: string | null;
  nextStatus: string;
  nextFollowUpAt: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO outreach_log (lead_id, wa_jid, attempt, kind, message, status, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      params.lead.id,
      params.lead.waJid,
      params.attempt,
      params.kind,
      params.message,
      params.status,
      params.error ?? null,
    ],
  );
  await query(
    `UPDATE leads
       SET outreach_status   = $2,
           outreach_attempts = outreach_attempts + 1,
           last_outreach_at  = now(),
           next_follow_up_at = $3,
           stage             = CASE WHEN stage = 'new' THEN 'contacted' ELSE stage END,
           last_seen         = now()
     WHERE id = $1`,
    [params.lead.id, params.nextStatus, params.nextFollowUpAt],
  );
}

export async function setOutreachStatus(params: {
  leadId: string;
  status: string;
  nextFollowUpAt?: string | null;
}): Promise<void> {
  await query(
    `UPDATE leads SET outreach_status = $2, next_follow_up_at = $3 WHERE id = $1`,
    [params.leadId, params.status, params.nextFollowUpAt ?? new Date().toISOString()],
  );
}

export async function setOptOut(leadId: string): Promise<void> {
  await query(
    `UPDATE leads
       SET opt_out = true, outreach_status = 'opted_out', next_follow_up_at = NULL
     WHERE id = $1`,
    [leadId],
  );
}

/** Set status kesiapan lead (gate Sales/outreach). */
export async function setLeadReadiness(leadId: string, readiness: string): Promise<void> {
  await query(`UPDATE leads SET readiness = $2, last_seen = now() WHERE id = $1`, [
    leadId,
    readiness,
  ]);
}

/* ─────────────────────────── meeting notes ───────────────────────── */

export async function saveMeetingNote(params: {
  leadId?: string | null;
  projectId?: string | null;
  content: string;
}): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO meeting_notes (id, lead_id, project_id, content) VALUES ($1,$2,$3,$4)`,
    [id, params.leadId ?? null, params.projectId ?? null, params.content],
  );
  return id;
}

export async function getLatestMeetingNote(leadId: string): Promise<string | null> {
  const { rows } = await query<{ content: string }>(
    `SELECT content FROM meeting_notes WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [leadId],
  );
  return rows[0]?.content ?? null;
}

export interface OutreachLogRow {
  id: string;
  leadId: string | null;
  waJid: string | null;
  name: string | null;
  attempt: number;
  kind: string;
  message: string;
  status: string;
  error: string | null;
  createdAt: string;
}

export async function listOutreachLog(limit = 50): Promise<OutreachLogRow[]> {
  const { rows } = await query<{
    id: string;
    lead_id: string | null;
    wa_jid: string | null;
    name: string | null;
    attempt: number;
    kind: string;
    message: string;
    status: string;
    error: string | null;
    created_at: Date;
  }>(
    `SELECT o.id::text, o.lead_id, o.wa_jid, l.name, o.attempt, o.kind,
            o.message, o.status, o.error, o.created_at
     FROM outreach_log o
     LEFT JOIN leads l ON l.id = o.lead_id
     ORDER BY o.id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    leadId: r.lead_id,
    waJid: r.wa_jid,
    name: r.name,
    attempt: r.attempt,
    kind: r.kind,
    message: r.message,
    status: r.status,
    error: r.error,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function getOutreachStats(): Promise<Record<string, number>> {
  const { rows } = await query<{ key: string; count: number }>(
    `SELECT outreach_status AS key, count(*)::int AS count
     FROM leads WHERE kind = 'prospect' GROUP BY 1`,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.count]));
}

/* ─────────────────────────── conversations ────────────────────────── */

export async function logConversation(params: {
  leadId: string | null;
  threadId: string;
  role: "user" | "assistant" | "system";
  direction: "inbound" | "outbound";
  content: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO conversations (lead_id, thread_id, role, direction, content, meta)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.leadId,
      params.threadId,
      params.role,
      params.direction,
      params.content,
      JSON.stringify(params.meta ?? {}),
    ],
  );
}

export interface ConversationRow {
  role: string;
  direction: string;
  content: string;
  createdAt: string;
}

export async function getRecentConversation(
  threadId: string,
  limit = 20,
): Promise<ConversationRow[]> {
  const { rows } = await query<{
    role: string;
    direction: string;
    content: string;
    created_at: Date;
  }>(
    `SELECT role, direction, content, created_at
     FROM conversations
     WHERE thread_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [threadId, limit],
  );
  return rows
    .map((r) => ({
      role: r.role,
      direction: r.direction,
      content: r.content,
      createdAt: r.created_at.toISOString(),
    }))
    .reverse();
}

/* ───────────────────────────── evaluations ────────────────────────── */

export async function saveEvaluation(params: {
  threadId: string;
  leadId: string | null;
  evaluation: Evaluation;
  reflection?: Reflection | null;
}): Promise<void> {
  await query(
    `INSERT INTO evaluations (thread_id, lead_id, score, payload)
     VALUES ($1, $2, $3, $4)`,
    [
      params.threadId,
      params.leadId,
      Math.round(params.evaluation.overall * 10),
      JSON.stringify({ evaluation: params.evaluation, reflection: params.reflection ?? null }),
    ],
  );
}

/* ────────────────────────────── bookings ──────────────────────────── */

export async function saveBooking(params: {
  leadId: string | null;
  threadId: string;
  booking: BookingInfo;
}): Promise<void> {
  await query(
    `INSERT INTO bookings (lead_id, thread_id, status, scheduled_at, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.leadId,
      params.threadId,
      params.booking.status,
      params.booking.scheduledAt,
      JSON.stringify(params.booking.details ?? {}),
    ],
  );
}

export async function listBookings(limit = 50): Promise<
  Array<{
    id: string;
    leadId: string | null;
    threadId: string | null;
    status: string;
    scheduledAt: string | null;
    details: Record<string, unknown>;
    createdAt: string;
  }>
> {
  const { rows } = await query<{
    id: string;
    lead_id: string | null;
    thread_id: string | null;
    status: string;
    scheduled_at: Date | null;
    details: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id::text, lead_id, thread_id, status, scheduled_at, details, created_at
     FROM bookings ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    leadId: r.lead_id,
    threadId: r.thread_id,
    status: r.status,
    scheduledAt: r.scheduled_at ? r.scheduled_at.toISOString() : null,
    details: r.details ?? {},
    createdAt: r.created_at.toISOString(),
  }));
}

/* ─────────────────────── evaluations listing ──────────────────────── */

export interface EvaluationRow {
  id: string;
  threadId: string;
  leadId: string | null;
  overall: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function listEvaluations(limit = 50): Promise<EvaluationRow[]> {
  const { rows } = await query<{
    id: string;
    thread_id: string;
    lead_id: string | null;
    payload: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id::text, thread_id, lead_id, payload, created_at
     FROM evaluations ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => {
    const evaluation = (r.payload?.evaluation ?? {}) as { overall?: number };
    return {
      id: r.id,
      threadId: r.thread_id,
      leadId: r.lead_id,
      overall: typeof evaluation.overall === "number" ? evaluation.overall : null,
      payload: r.payload ?? {},
      createdAt: r.created_at.toISOString(),
    };
  });
}

export async function listEvaluationsByLead(leadId: string): Promise<EvaluationRow[]> {
  const { rows } = await query<{
    id: string;
    thread_id: string;
    lead_id: string | null;
    payload: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id::text, thread_id, lead_id, payload, created_at
     FROM evaluations WHERE lead_id = $1 ORDER BY id DESC LIMIT 50`,
    [leadId],
  );
  return rows.map((r) => {
    const evaluation = (r.payload?.evaluation ?? {}) as { overall?: number };
    return {
      id: r.id,
      threadId: r.thread_id,
      leadId: r.lead_id,
      overall: typeof evaluation.overall === "number" ? evaluation.overall : null,
      payload: r.payload ?? {},
      createdAt: r.created_at.toISOString(),
    };
  });
}

export async function getConversationByLeadId(
  leadId: string,
  limit = 100,
): Promise<ConversationRow[]> {
  const { rows } = await query<{
    role: string;
    direction: string;
    content: string;
    created_at: Date;
  }>(
    `SELECT role, direction, content, created_at
     FROM conversations WHERE lead_id = $1 ORDER BY id ASC LIMIT $2`,
    [leadId, limit],
  );
  return rows.map((r) => ({
    role: r.role,
    direction: r.direction,
    content: r.content,
    createdAt: r.created_at.toISOString(),
  }));
}

/* ─────────────────────────── lead detail ─────────────────────────── */

export async function getLeadDetail(leadId: string) {
  const lead = await getLeadById(leadId);
  if (!lead) return null;
  const [messages, evaluations, bookings] = await Promise.all([
    getConversationByLeadId(leadId, 200),
    listEvaluationsByLead(leadId),
    listBookings(200).then((b) => b.filter((x) => x.leadId === leadId)),
  ]);
  return {
    lead,
    threadId: `wa:${lead.waJid}`,
    messages,
    evaluations,
    bookings,
  };
}

/* ───────────────────────────── metrics ───────────────────────────── */

export interface Metrics {
  totals: {
    leads: number;
    conversations: number;
    memories: number;
    evaluations: number;
    bookings: number;
  };
  segments: Record<string, number>;
  stages: Record<string, number>;
  bookingsByStatus: Record<string, number>;
  scoreBuckets: { label: string; count: number }[];
  avgScore: number;
  avgEvaluation: number | null;
  leadsByDay: { date: string; count: number }[];
  recentEvaluations: EvaluationRow[];
}

const toCountRecord = (rows: Array<{ key: string; count: number }>): Record<string, number> =>
  Object.fromEntries(rows.map((r) => [r.key, r.count]));

export async function getMetrics(): Promise<Metrics> {
  const [totalsRes, segmentsRes, stagesRes, bookingsRes, bucketsRes, scoreRes, evalRes, dailyRes, recentEvaluations] =
    await Promise.all([
      query<{
        leads: number;
        conversations: number;
        memories: number;
        evaluations: number;
        bookings: number;
      }>(
        `SELECT
           (SELECT count(*) FROM leads)::int AS leads,
           (SELECT count(*) FROM conversations)::int AS conversations,
           (SELECT count(*) FROM long_term_memory)::int AS memories,
           (SELECT count(*) FROM evaluations)::int AS evaluations,
           (SELECT count(*) FROM bookings)::int AS bookings`,
      ),
      query<{ key: string; count: number }>(
        `SELECT COALESCE(segment, 'unscored') AS key, count(*)::int AS count
         FROM leads GROUP BY 1 ORDER BY 2 DESC`,
      ),
      query<{ key: string; count: number }>(
        `SELECT COALESCE(stage, 'new') AS key, count(*)::int AS count
         FROM leads GROUP BY 1 ORDER BY 2 DESC`,
      ),
      query<{ key: string; count: number }>(
        `SELECT status AS key, count(*)::int AS count FROM bookings GROUP BY 1`,
      ),
      query<{ low: number; mid: number; high: number }>(
        `SELECT
           count(*) FILTER (WHERE score < 40)::int AS low,
           count(*) FILTER (WHERE score >= 40 AND score < 75)::int AS mid,
           count(*) FILTER (WHERE score >= 75)::int AS high
         FROM leads`,
      ),
      query<{ avg: number }>(`SELECT COALESCE(round(avg(score)), 0)::int AS avg FROM leads`),
      query<{ avg: number | null }>(
        `SELECT round(avg((payload->'evaluation'->>'overall')::numeric), 1) AS avg
         FROM evaluations WHERE payload->'evaluation'->>'overall' IS NOT NULL`,
      ),
      query<{ date: string; count: number }>(
        `SELECT to_char(d::date, 'YYYY-MM-DD') AS date, COALESCE(c.count, 0)::int AS count
         FROM generate_series(current_date - interval '13 day', current_date, interval '1 day') AS d
         LEFT JOIN (
           SELECT date_trunc('day', first_seen) AS day, count(*)::int AS count
           FROM leads GROUP BY 1
         ) AS c ON c.day = d::date
         ORDER BY d`,
      ),
      listEvaluations(8),
    ]);

  const buckets = bucketsRes.rows[0] ?? { low: 0, mid: 0, high: 0 };

  return {
    totals: totalsRes.rows[0] ?? {
      leads: 0,
      conversations: 0,
      memories: 0,
      evaluations: 0,
      bookings: 0,
    },
    segments: toCountRecord(segmentsRes.rows),
    stages: toCountRecord(stagesRes.rows),
    bookingsByStatus: toCountRecord(bookingsRes.rows),
    scoreBuckets: [
      { label: "Nurture · <40", count: buckets.low },
      { label: "Objection · 40–74", count: buckets.mid },
      { label: "Closing · ≥75", count: buckets.high },
    ],
    avgScore: scoreRes.rows[0]?.avg ?? 0,
    avgEvaluation:
      evalRes.rows[0]?.avg != null ? Number(evalRes.rows[0].avg) : null,
    leadsByDay: dailyRes.rows,
    recentEvaluations,
  };
}

/* ─────────────────────────── research reports ─────────────────────── */

interface ResearchReportRow {
  id: string;
  title: string;
  objective: string;
  status: string;
  format: string;
  language: string | null;
  workspace: string | null;
  summary: string | null;
  quality: number | null;
  iterations: number;
  source_count: number;
  fact_count: number;
  brief: ResearchBrief | null;
  report_path: string | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

const toResearchRecord = (r: ResearchReportRow): ResearchReportRecord => ({
  id: r.id,
  title: r.title,
  objective: r.objective,
  status: r.status,
  format: (r.format as ResearchReportRecord["format"]) ?? "markdown",
  language: r.language,
  workspace: r.workspace,
  summary: r.summary,
  quality: r.quality,
  iterations: r.iterations,
  sourceCount: r.source_count,
  factCount: r.fact_count,
  brief: r.brief ?? ({} as ResearchBrief),
  reportPath: r.report_path,
  error: r.error,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

export async function createResearchReport(params: {
  id: string;
  brief: ResearchBrief;
  workspace: string;
}): Promise<void> {
  await query(
    `INSERT INTO research_reports (id, title, objective, status, format, language, workspace, brief)
     VALUES ($1,$2,$3,'running',$4,$5,$6,$7::jsonb)`,
    [
      params.id,
      params.brief.title,
      params.brief.objective,
      params.brief.format,
      params.brief.language,
      params.workspace,
      JSON.stringify(params.brief),
    ],
  );
}

export async function updateResearchReport(params: {
  id: string;
  status?: "running" | "completed" | "failed";
  summary?: string | null;
  quality?: number | null;
  iterations?: number;
  sourceCount?: number;
  factCount?: number;
  reportPath?: string | null;
  error?: string | null;
}): Promise<void> {
  await query(
    `UPDATE research_reports SET
       status       = COALESCE($2, status),
       summary      = COALESCE($3, summary),
       quality      = COALESCE($4, quality),
       iterations   = COALESCE($5, iterations),
       source_count = COALESCE($6, source_count),
       fact_count   = COALESCE($7, fact_count),
       report_path  = COALESCE($8, report_path),
       error        = COALESCE($9, error),
       updated_at   = now()
     WHERE id = $1`,
    [
      params.id,
      params.status ?? null,
      params.summary ?? null,
      params.quality ?? null,
      params.iterations ?? null,
      params.sourceCount ?? null,
      params.factCount ?? null,
      params.reportPath ?? null,
      params.error ?? null,
    ],
  );
}

export async function getResearchReport(
  id: string,
): Promise<ResearchReportRecord | null> {
  const { rows } = await query<ResearchReportRow>(
    `SELECT * FROM research_reports WHERE id = $1`,
    [id],
  );
  return rows[0] ? toResearchRecord(rows[0]) : null;
}

export async function listResearchReports(
  limit = 50,
  offset = 0,
): Promise<ResearchReportRecord[]> {
  const { rows } = await query<ResearchReportRow>(
    `SELECT * FROM research_reports ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows.map(toResearchRecord);
}
