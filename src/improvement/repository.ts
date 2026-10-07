import { query } from "../db/pool.js";
import { AGENT_REGISTRY } from "../pipeline/agentRegistry.js";

export type ImprovementKind = "lesson" | "suggestion";
export type ImprovementStatus = "proposed" | "approved" | "rejected" | "applied";

export interface ImprovementRecord {
  id: string;
  agent: string;
  kind: ImprovementKind;
  status: ImprovementStatus;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  createdAt: string;
  decidedAt: string | null;
}

interface Row {
  id: string;
  agent: string;
  kind: string;
  status: string;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  created_at: Date;
  decided_at: Date | null;
}

const toRecord = (r: Row): ImprovementRecord => ({
  id: r.id,
  agent: r.agent,
  kind: r.kind as ImprovementKind,
  status: r.status as ImprovementStatus,
  title: r.title,
  detail: r.detail,
  evidence: r.evidence ?? {},
  createdAt: r.created_at.toISOString(),
  decidedAt: r.decided_at ? r.decided_at.toISOString() : null,
});

const SELECT_COLS =
  "id::text, agent, kind, status, title, detail, evidence, created_at, decided_at";

/** Catat satu pelajaran (lesson) atau usulan (suggestion) untuk sebuah agent. */
export async function recordImprovement(params: {
  agent: string;
  kind?: ImprovementKind;
  status?: ImprovementStatus;
  title: string;
  detail: string;
  evidence?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO agent_improvements (agent, kind, status, title, detail, evidence)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      params.agent,
      params.kind ?? "lesson",
      params.status ?? "proposed",
      params.title,
      params.detail,
      JSON.stringify(params.evidence ?? {}),
    ],
  );
}

export async function listImprovements(
  params: { agent?: string; kind?: ImprovementKind; status?: ImprovementStatus; limit?: number } = {},
): Promise<ImprovementRecord[]> {
  const { rows } = await query<Row>(
    `SELECT ${SELECT_COLS} FROM agent_improvements
     WHERE ($1::text IS NULL OR agent=$1)
       AND ($2::text IS NULL OR kind=$2)
       AND ($3::text IS NULL OR status=$3)
     ORDER BY created_at DESC LIMIT $4`,
    [params.agent ?? null, params.kind ?? null, params.status ?? null, params.limit ?? 100],
  );
  return rows.map(toRecord);
}

export async function decideImprovement(
  id: string,
  status: Extract<ImprovementStatus, "approved" | "rejected" | "applied">,
  by?: string,
): Promise<ImprovementRecord | null> {
  const { rows } = await query<Row>(
    `UPDATE agent_improvements SET status=$2, decided_at=now(), decided_by=$3
     WHERE id=$1 RETURNING ${SELECT_COLS}`,
    [id, status, by ?? null],
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function getImprovement(id: string): Promise<ImprovementRecord | null> {
  const { rows } = await query<Row>(
    `SELECT ${SELECT_COLS} FROM agent_improvements WHERE id=$1`,
    [id],
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

/* ───────────────────────────── growth ───────────────────────────── */

export interface AgentGrowth {
  slug: string;
  name: string;
  divisionCode: string;
  done: number;
  failed: number;
  running: number;
  queued: number;
  donePrev: number;
  failedPrev: number;
  /** Rasio sukses (done/(done+failed)) dalam jendela; null bila tak ada data. */
  successRate: number | null;
  /** Perubahan jumlah job selesai vs periode sebelumnya. */
  trend: number;
  lessons7d: number;
  suggestionsPending: number;
  suggestionsApplied: number;
}

/** KPI + tren pertumbuhan per agent (job selesai/gagal + pelajaran & usulan). */
export async function buildGrowth(days = 14): Promise<{ days: number; agents: AgentGrowth[] }> {
  const allTypes = [...new Set(AGENT_REGISTRY.flatMap((a) => a.jobTypes))];

  const [cur, prev, lessonRows] = await Promise.all([
    query<{ type: string; status: string; c: number }>(
      `SELECT type, status, count(*)::int AS c FROM jobs
       WHERE type=ANY($1) AND updated_at >= now() - ($2 || ' days')::interval
       GROUP BY type, status`,
      [allTypes, String(days)],
    ),
    query<{ type: string; status: string; c: number }>(
      `SELECT type, status, count(*)::int AS c FROM jobs
       WHERE type=ANY($1) AND updated_at >= now() - ($2 || ' days')::interval
         AND updated_at < now() - ($3 || ' days')::interval
       GROUP BY type, status`,
      [allTypes, String(days * 2), String(days)],
    ),
    query<{ agent: string; kind: string; status: string; c: number }>(
      `SELECT agent, kind, status, count(*)::int AS c FROM agent_improvements
       WHERE created_at >= now() - interval '7 days' GROUP BY 1,2,3`,
      [],
    ),
  ]);

  const curAgg = new Map<string, { done: number; failed: number; running: number; queued: number }>();
  for (const r of cur.rows) {
    const e = curAgg.get(r.type) ?? { done: 0, failed: 0, running: 0, queued: 0 };
    if (r.status === "done" || r.status === "failed" || r.status === "running" || r.status === "queued") {
      e[r.status] += r.c;
    }
    curAgg.set(r.type, e);
  }
  const prevAgg = new Map<string, { done: number; failed: number }>();
  for (const r of prev.rows) {
    const e = prevAgg.get(r.type) ?? { done: 0, failed: 0 };
    if (r.status === "done" || r.status === "failed") e[r.status] += r.c;
    prevAgg.set(r.type, e);
  }
  const lessonAgg = new Map<string, { lessons: number; pending: number; applied: number }>();
  for (const r of lessonRows.rows) {
    const e = lessonAgg.get(r.agent) ?? { lessons: 0, pending: 0, applied: 0 };
    if (r.kind === "lesson") e.lessons += r.c;
    else if (r.status === "proposed") e.pending += r.c;
    else if (r.status === "approved" || r.status === "applied") e.applied += r.c;
    lessonAgg.set(r.agent, e);
  }

  const agents: AgentGrowth[] = AGENT_REGISTRY.map((agent) => {
    const j = { done: 0, failed: 0, running: 0, queued: 0 };
    for (const type of agent.jobTypes) {
      const c = curAgg.get(type);
      if (!c) continue;
      j.done += c.done;
      j.failed += c.failed;
      j.running += c.running;
      j.queued += c.queued;
    }
    const p = { done: 0, failed: 0 };
    for (const type of agent.jobTypes) {
      const c = prevAgg.get(type);
      if (!c) continue;
      p.done += c.done;
      p.failed += c.failed;
    }
    const total = j.done + j.failed;
    const l = lessonAgg.get(agent.slug) ?? { lessons: 0, pending: 0, applied: 0 };
    return {
      slug: agent.slug,
      name: agent.name,
      divisionCode: agent.divisionCode,
      ...j,
      donePrev: p.done,
      failedPrev: p.failed,
      successRate: total > 0 ? Math.round((j.done / total) * 100) : null,
      trend: j.done - p.done,
      lessons7d: l.lessons,
      suggestionsPending: l.pending,
      suggestionsApplied: l.applied,
    };
  });

  return { days, agents };
}
