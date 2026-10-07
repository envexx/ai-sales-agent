import { query } from "../db/pool.js";
import {
  AGENT_REGISTRY,
  ALL_APPROVAL_KINDS,
  ALL_EVENT_TYPES,
  ALL_JOB_TYPES,
} from "../pipeline/agentRegistry.js";

/**
 * Laporan harian per-agent + deteksi anomali (peran Supervisor sebagai
 * peninjau). Supervisor **tidak** mendelegasikan pekerjaan; ia merangkum apa
 * yang dikerjakan tiap agent dan menandai penyimpangan untuk owner.
 */
export interface AgentDailyReport {
  slug: string;
  name: string;
  divisionCode: string;
  done: number;
  failed: number;
  queued: number;
  running: number;
  lastEventType: string | null;
  lastEventAt: string | null;
  approvalsPending: number;
}

export interface SupervisorReport {
  generatedAt: string;
  windowHours: number;
  agents: AgentDailyReport[];
  anomalies: string[];
}

export async function buildSupervisorReport(windowHours = 24): Promise<SupervisorReport> {
  const since = new Date(Date.now() - windowHours * 3_600_000);

  const [jobRows, eventRows, approvalRows, backlogRes, stuckRes, previewRes] =
    await Promise.all([
      query<{ type: string; status: string; count: number }>(
        `SELECT type, status, count(*)::int AS count FROM jobs
         WHERE type = ANY($1) AND updated_at >= $2 GROUP BY type, status`,
        [ALL_JOB_TYPES, since],
      ),
      query<{ type: string; last: Date }>(
        `SELECT type, max(created_at) AS last FROM events
         WHERE created_at >= $2 AND type = ANY($1) GROUP BY type`,
        [ALL_EVENT_TYPES, since],
      ),
      ALL_APPROVAL_KINDS.length
        ? query<{ kind: string; count: number }>(
            `SELECT kind, count(*)::int AS count FROM approvals
             WHERE status='pending' AND kind = ANY($1) GROUP BY kind`,
            [ALL_APPROVAL_KINDS],
          )
        : Promise.resolve({ rows: [] as { kind: string; count: number }[] }),
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM leads
         WHERE kind='prospect' AND readiness='discovered'`,
      ),
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM projects
         WHERE stage='done_review' AND updated_at < now() - interval '2 days'`,
      ),
      query<{ count: string }>(
        `SELECT count(*)::text AS count FROM projects WHERE stage='preview'`,
      ),
    ]);

  const jobAgg = new Map<string, { done: number; failed: number; queued: number; running: number }>();
  for (const row of jobRows.rows) {
    const entry = jobAgg.get(row.type) ?? { done: 0, failed: 0, queued: 0, running: 0 };
    if (row.status === "done" || row.status === "failed" || row.status === "queued" || row.status === "running") {
      entry[row.status] += row.count;
    }
    jobAgg.set(row.type, entry);
  }

  const eventAgg = new Map<string, string>();
  for (const row of eventRows.rows) eventAgg.set(row.type, row.last.toISOString());
  const approvalAgg = new Map<string, number>();
  for (const row of approvalRows.rows) approvalAgg.set(row.kind, row.count);

  const agents: AgentDailyReport[] = AGENT_REGISTRY.map((agent) => {
    const jobs = { done: 0, failed: 0, queued: 0, running: 0 };
    for (const type of agent.jobTypes) {
      const j = jobAgg.get(type);
      if (!j) continue;
      jobs.done += j.done;
      jobs.failed += j.failed;
      jobs.queued += j.queued;
      jobs.running += j.running;
    }
    let lastEventType: string | null = null;
    let lastEventAt: string | null = null;
    for (const type of agent.eventTypes) {
      const at = eventAgg.get(type);
      if (at && (!lastEventAt || at > lastEventAt)) {
        lastEventAt = at;
        lastEventType = type;
      }
    }
    return {
      slug: agent.slug,
      name: agent.name,
      divisionCode: agent.divisionCode,
      ...jobs,
      lastEventType,
      lastEventAt,
      approvalsPending: (agent.approvalKinds ?? []).reduce(
        (n, kind) => n + (approvalAgg.get(kind) ?? 0),
        0,
      ),
    };
  });

  // ── Koreksi / anomali (yang harus ditindak) ──
  const anomalies: string[] = [];
  const failed = agents.filter((a) => a.failed > 0);
  if (failed.length) {
    anomalies.push(
      `Job gagal: ${failed.map((a) => `${a.name} (${a.failed})`).join(", ")}`,
    );
  }
  const backlog = Number(backlogRes.rows[0]?.count ?? 0);
  if (backlog > 0) anomalies.push(`${backlog} prospek menunggu Scout (status discovered)`);
  const stuck = Number(stuckRes.rows[0]?.count ?? 0);
  if (stuck > 0) anomalies.push(`${stuck} proyek telat di 'done_review' (>2 hari)`);
  const pending = agents.reduce((n, a) => n + a.approvalsPending, 0);
  if (pending > 0) anomalies.push(`${pending} approval menunggu keputusan owner`);

  return { generatedAt: new Date().toISOString(), windowHours, agents, anomalies };
}
