import { query } from "../db/pool.js";
import { AGENT_HANDOFFS, findAgent } from "./agentRegistry.js";
import { listJobs } from "./repository.js";
import type { EventRecord, JobRecord } from "./types.js";

export type WorkflowState = "waiting" | "running" | "done" | "blocked" | "unknown";
export interface WorkflowTask {
  id: string;
  title: string;
  status: string;
  receivedAt: string;
  updatedAt: string;
  scheduledAt: string | null;
  workState: WorkflowState;
  resultState: WorkflowState;
  result: string;
  error: string | null;
  entity: { type: string; id: string } | null;
  evidence: { id: string; type: string; at: string; summary: string }[];
  handoffs: { agent: string; name: string; state: WorkflowState; taskId: string | null; proof: string | null }[];
}

const str = (value: unknown) => typeof value === "string" ? value : null;
const eventSummary = (event: EventRecord): string => {
  if (event.type === "job.done") return str(event.payload.note) ?? "Pekerjaan selesai";
  if (event.type === "qa.completed") return event.payload.passed === false ? "QA tidak lulus; perlu perbaikan" : `QA selesai · skor ${event.payload.score ?? "—"}`;
  if (event.type === "prospecting.completed") return `${event.payload.saved ?? 0} prospek tersimpan`;
  return str(event.payload.title) ?? event.type;
};
const rootsFor = (job: JobRecord, events: EventRecord[]) => new Set([
  str(job.payload.projectId), str(job.payload.leadId),
  ...events.filter((event) => event.entityId === job.id || event.payload.jobId === job.id)
    .flatMap((event) => [str(event.payload.projectId), str(event.payload.leadId), event.entityType !== "job" ? event.entityId : null]),
].filter((value): value is string => Boolean(value)));

/** Exact source-job links first; older records may use the same entity, never agent-wide status. */
export function deriveWorkflowTask(slug: string, job: JobRecord, events: EventRecord[], downstream: JobRecord[]): WorkflowTask {
  const agent = findAgent(slug)!;
  const roots = rootsFor(job, events);
  const owned = events.filter((event) =>
    event.payload.jobId === job.id || (event.entityType === "job" && event.entityId === job.id) ||
    (agent.eventTypes.includes(event.type) && Boolean(event.entityId && roots.has(event.entityId)) &&
      event.createdAt >= job.createdAt && (job.status !== "done" || event.createdAt <= job.updatedAt)),
  ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const outputs = owned.filter((event) => agent.eventTypes.includes(event.type));
  const lastOutput = outputs.at(-1);
  const rejected = owned.some((event) => event.type === "qa.completed" && event.payload.passed === false);
  const finished = owned.findLast((event) => event.type === "job.done");
  const entityId = str(job.payload.projectId) ?? str(finished?.payload.projectId) ?? str(job.payload.leadId);
  const entityType = str(job.payload.projectId) || str(finished?.payload.projectId) ? "project" : "lead";
  return {
    id: job.id, title: str(job.payload.title) ?? str(job.payload.company) ?? str(job.payload.name) ?? job.type,
    status: job.status, receivedAt: job.createdAt, updatedAt: job.updatedAt, scheduledAt: job.runAt,
    workState: job.status === "running" ? "running" : job.status === "done" ? "done" : job.status === "failed" || job.status === "canceled" ? "blocked" : "waiting",
    resultState: rejected ? "blocked" : lastOutput ? "done" : "waiting",
    result: rejected ? "QA tidak lulus; serah terima belum dilanjutkan." : lastOutput ? eventSummary(lastOutput) : finished ? `${eventSummary(finished)}. Belum ada bukti hasil bisnis untuk tugas ini.` : "Hasil belum tercatat.",
    error: job.lastError, entity: entityId ? { type: entityType, id: entityId } : null,
    evidence: owned.map((event) => ({ id: event.id, type: event.type, at: event.createdAt, summary: eventSummary(event) })),
    handoffs: (AGENT_HANDOFFS[slug] ?? []).map((nextSlug) => {
      const next = findAgent(nextSlug)!;
      const child = downstream.filter((candidate) => next.jobTypes.includes(candidate.type) &&
        (candidate.payload.sourceJobId === job.id || (!candidate.payload.sourceJobId && candidate.createdAt >= job.createdAt &&
          [str(candidate.payload.projectId), str(candidate.payload.leadId)].some((id) => id && roots.has(id))))
      ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const salesEvent = nextSlug === "sales" ? events.findLast((event) => event.type === "lead.in_sales" && event.entityId && roots.has(event.entityId) && event.createdAt >= job.createdAt) : undefined;
      return {
        agent: nextSlug, name: next.name,
        state: rejected ? "blocked" : child?.status === "running" ? "running" : child?.status === "done" ? "done" : child?.status === "failed" ? "blocked" : child ? "waiting" : salesEvent ? "done" : "unknown",
        taskId: child?.id ?? null,
        proof: child ? child.payload.sourceJobId === job.id ? "Tertaut langsung ke tugas sumber" : "Entitas bisnis yang sama" : salesEvent ? "Lead masuk Sales" : null,
      };
    }),
  };
}

export async function buildAgentWorkflow(slug: string) {
  const agent = findAgent(slug);
  if (!agent) return null;
  if (slug === "sales") return buildSalesWorkflow();
  const jobs = await listJobs(60, agent.jobTypes);
  const ids = jobs.map((job) => job.id);
  const roots = jobs.flatMap((job) => [str(job.payload.projectId), str(job.payload.leadId)]).filter(Boolean);
  const { rows } = await query<{
    id: string; type: string; entity_type: string | null; entity_id: string | null; payload: Record<string, unknown>; created_at: Date;
  }>(`SELECT id::text,type,entity_type,entity_id,payload,created_at FROM events
      WHERE entity_id=ANY($1::text[]) OR payload->>'jobId'=ANY($2::text[])
      ORDER BY created_at DESC LIMIT 600`, [[...ids, ...roots], ids]);
  let events: EventRecord[] = rows.map((row) => ({ id: row.id, type: row.type, entityType: row.entity_type, entityId: row.entity_id, payload: row.payload, createdAt: row.created_at.toISOString() }));
  const allRoots = [...new Set(jobs.flatMap((job) => [...rootsFor(job, events)]))];
  const related = await query<typeof rows[number]>(`SELECT id::text,type,entity_type,entity_id,payload,created_at FROM events
    WHERE entity_id=ANY($1::text[]) AND type=ANY($2::text[]) ORDER BY created_at DESC LIMIT 600`, [allRoots, [...agent.eventTypes, "lead.in_sales"]]);
  const seen = new Set(events.map((event) => event.id));
  events = [...events, ...related.rows.filter((row) => !seen.has(row.id)).map((row) => ({ id: row.id, type: row.type, entityType: row.entity_type, entityId: row.entity_id, payload: row.payload, createdAt: row.created_at.toISOString() }))].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const nextTypes = (AGENT_HANDOFFS[slug] ?? []).flatMap((next) => findAgent(next)?.jobTypes ?? []);
  const { rows: childRows } = await query<{ id: string }>(`SELECT id FROM jobs WHERE type=ANY($1::text[]) AND
    (payload->>'sourceJobId'=ANY($2::text[]) OR payload->>'projectId'=ANY($3::text[]) OR payload->>'leadId'=ANY($3::text[]))`, [nextTypes, ids, allRoots]);
  const childIds = childRows.map((row) => row.id);
  const downstream = await listJobs(childIds.length, nextTypes, childIds);
  return { slug, generatedAt: new Date().toISOString(), tasks: jobs.map((job) => deriveWorkflowTask(slug, job, events, downstream)) };
}

async function buildSalesWorkflow() {
  const { rows } = await query<{ id: string; name: string | null; last: Date; outbound: number; first: Date; direction: string }>(
    `SELECT l.id,l.name,max(c.created_at) AS last,min(c.created_at) AS first,
      count(*) FILTER (WHERE c.direction='outbound')::int AS outbound,
      (array_agg(c.direction ORDER BY c.created_at DESC,c.id DESC))[1] AS direction
      FROM leads l JOIN conversations c ON c.lead_id=l.id GROUP BY l.id,l.name ORDER BY last DESC LIMIT 60`,
  );
  const nextTypes = ["scoper.prd", "support.triage"];
  const children = await listJobs(200, nextTypes);
  const runtime = await query<{ entity_id: string; type: string; created_at: Date }>(`SELECT DISTINCT ON (entity_id) entity_id,type,created_at FROM events
    WHERE type=ANY($1::text[]) AND entity_id=ANY($2::text[]) ORDER BY entity_id,created_at DESC,id DESC`, [["sales.started", "sales.completed", "sales.failed"], rows.map((lead) => lead.id)]);
  const tasks: WorkflowTask[] = rows.map((lead) => ({
    id: lead.id, title: lead.name ?? `Lead ${lead.id.slice(0, 8)}`, status: "conversation",
    receivedAt: lead.first.toISOString(), updatedAt: lead.last.toISOString(), scheduledAt: null,
    workState: runtime.rows.find((row) => row.entity_id === lead.id)?.type === "sales.started" ? "running" : runtime.rows.find((row) => row.entity_id === lead.id)?.type === "sales.failed" ? "blocked" : lead.direction === "outbound" ? "done" : "unknown", resultState: lead.direction === "outbound" ? "done" : "waiting",
    result: lead.outbound > 0 ? `${lead.outbound} balasan tercatat. Periksa serah terima untuk mengetahui kelanjutan kebutuhan klien.` : "Pesan masuk tercatat; status eksekusi belum tersedia.",
    error: null, entity: { type: "lead", id: lead.id },
    evidence: [{ id: lead.id, type: "conversation", at: lead.last.toISOString(), summary: "Riwayat percakapan tersimpan" }],
    handoffs: (AGENT_HANDOFFS.sales ?? []).map((slug) => {
      const agent = findAgent(slug)!;
      const child = children.find((job) => agent.jobTypes.includes(job.type) && job.payload.leadId === lead.id);
      return { agent: slug, name: agent.name, state: child?.status === "running" ? "running" : child?.status === "done" ? "done" : child?.status === "failed" ? "blocked" : child ? "waiting" : "unknown", taskId: child?.id ?? null, proof: child ? "Lead yang sama" : null };
    }),
  }));
  return { slug: "sales", generatedAt: new Date().toISOString(), tasks };
}
