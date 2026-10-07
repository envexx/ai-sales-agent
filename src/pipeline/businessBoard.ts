import { query } from "../db/pool.js";
import { AGENT_REGISTRY } from "./agentRegistry.js";
import { listJobs } from "./repository.js";

export const BUSINESS_COLUMNS = [
  { id: "research", label: "Riset", agent: "prospecting" },
  { id: "prospects", label: "Prospek", agent: "prospecting" },
  { id: "sales", label: "Sales", agent: "sales" },
  { id: "preparation", label: "PRD & Persiapan", agent: "scoper" },
  { id: "build", label: "Pembangunan", agent: "owner" },
  { id: "review", label: "QA & Dokumen", agent: "qa" },
  { id: "handover", label: "Serah terima", agent: "handover" },
  { id: "done", label: "Selesai / Ditutup", agent: "content" },
];
const AGENT_COLUMN: Record<string, string> = { prospecting: "research", sales: "sales", scoper: "preparation", legal: "preparation", intake: "preparation", owner: "build", qa: "review", handover: "handover", support: "handover", developer: "done", content: "done" };
type CaseRow = { lead_id: string | null; project_id: string | null; title: string; company: string | null; readiness: string | null; stage: string | null; engagement_path: string | null; updated_at: Date; created_at: Date };
const text = (value: unknown) => typeof value === "string" ? value : null;
const COMPLETED_EVENTS = new Set(["briefing.sent", "supervisor.review", "prospecting.completed", "prospect.discovered", "prospect.scouted", "lead.scouted_ready", "sales.completed", "prd.ready", "legal.ready", "credential.stored", "qa.completed", "docs.ready", "handover.ready", "support.escalated", "monitor.check", "developer.plan_ready", "developer.applied", "developer.deployed", "content.ready", "case_study.ingested"]);

export function businessStage(row: Pick<CaseRow, "project_id" | "stage" | "readiness">): string {
  if (row.project_id) {
    if (["delivered", "retained"].includes(row.stage ?? "")) return "done";
    if (["done", "handover"].includes(row.stage ?? "")) return "handover";
    if (["done_review", "built", "qa"].includes(row.stage ?? "")) return "review";
    if (["preview", "building"].includes(row.stage ?? "")) return "build";
    return "preparation";
  }
  if (row.readiness === "discovered") return "prospects";
  if (row.readiness === "won") return "preparation";
  if (row.readiness === "lost") return "done";
  return "sales";
}

export async function buildBusinessBoard() {
  const { rows } = await query<CaseRow>(`SELECT l.id AS lead_id,p.id AS project_id,
      COALESCE(p.title,l.name,l.company,'Lead tanpa nama') AS title,l.company,l.readiness,p.stage,l.meta->>'engagementPath' AS engagement_path,
      GREATEST(l.last_seen,COALESCE(p.updated_at,l.last_seen)) AS updated_at,
      COALESCE(p.created_at,l.first_seen) AS created_at
      FROM leads l LEFT JOIN clients c ON c.lead_id=l.id LEFT JOIN projects p ON p.client_id=c.id
      UNION ALL SELECT c.lead_id,p.id,p.title,c.company,NULL,p.stage,NULL,p.updated_at,p.created_at
      FROM projects p LEFT JOIN clients c ON c.id=p.client_id
      WHERE c.lead_id IS NULL OR NOT EXISTS(SELECT 1 FROM leads l WHERE l.id=c.lead_id)
      ORDER BY updated_at DESC LIMIT 201`);
  const limited = rows.length > 200;
  const cases = rows.slice(0, 200);
  const entityIds = cases.flatMap((row) => [row.lead_id, row.project_id]).filter(Boolean);
  const { rows: jobIds } = await query<{ id: string }>(`SELECT id FROM jobs WHERE payload->>'leadId'=ANY($1::text[])
    OR payload->>'projectId'=ANY($1::text[])
    OR (type=ANY($2::text[]) AND status IN ('queued','running','failed'))`, [entityIds, ["prospecting.scan", "prospecting.daily", "prospecting.live"]]);
  const jobs = await listJobs(jobIds.length, undefined, jobIds.map((row) => row.id));
  const { rows: eventRows } = await query<{ id: string; type: string; entity_id: string | null; payload: Record<string, unknown>; created_at: Date }>(
    `SELECT id::text,type,entity_id,payload,created_at FROM events WHERE entity_id=ANY($1::text[])
      OR payload->>'jobId'=ANY($2::text[]) ORDER BY created_at DESC LIMIT 1000`, [[...entityIds, ...jobs.map((job) => job.id)], jobs.map((job) => job.id)],
  );
  const { rows: approvals } = await query<{ id: string; title: string; payload: Record<string, unknown> }>(
    `SELECT id,title,payload FROM approvals WHERE status='pending' AND
      (payload->>'projectId'=ANY($1::text[]) OR payload->>'leadId'=ANY($1::text[]))`, [entityIds],
  );
  const records = cases.map((row) => {
    const relatedJobs = jobs.filter((job) => (row.project_id && job.payload.projectId === row.project_id) || (row.lead_id && job.payload.leadId === row.lead_id && (!row.project_id || !job.payload.projectId || job.payload.projectId === row.project_id)));
    const relatedIds = new Set(relatedJobs.map((job) => job.id));
    const events = eventRows.filter((event) => Boolean(row.project_id && event.entity_id === row.project_id) || Boolean(row.lead_id && event.entity_id === row.lead_id) || Boolean(event.entity_id && relatedIds.has(event.entity_id)) || Boolean(text(event.payload.jobId) && relatedIds.has(text(event.payload.jobId)!)));
    const pending = approvals.filter((approval) => row.project_id ? approval.payload.projectId === row.project_id : approval.payload.leadId === row.lead_id);
    const baseColumn = businessStage(row);
    const latestJobs = relatedJobs.filter((job, index) => relatedJobs.findIndex((other) => other.type === job.type) === index);
    const currentJob = latestJobs.find((job) => job.status === "running") ?? latestJobs.find((job) => job.status === "queued") ?? latestJobs.find((job) => job.status === "failed" && new Date(job.updatedAt) >= row.updated_at);
    const mostRecentJob = relatedJobs[0];
    const lastAgent = mostRecentJob ? AGENT_REGISTRY.find((agent) => agent.jobTypes.includes(mostRecentJob.type))?.slug : undefined;
    const currentAgent = currentJob ? AGENT_REGISTRY.find((agent) => agent.jobTypes.includes(currentJob.type))?.slug : baseColumn === "preparation" && lastAgent && AGENT_COLUMN[lastAgent] === baseColumn ? lastAgent : BUSINESS_COLUMNS.find((column) => column.id === baseColumn)?.agent;
    const column = currentJob && currentAgent && currentJob.status !== "queued" ? AGENT_COLUMN[currentAgent] ?? baseColumn : baseColumn;
    const steps = AGENT_REGISTRY.map((agent) => {
      const ownedJobs = latestJobs.filter((job) => agent.jobTypes.includes(job.type));
      const ownedEvents = events.filter((event) => agent.eventTypes.includes(event.type));
      const latest = ownedEvents[0];
      const failedQa = agent.slug === "qa" && latest?.type === "qa.completed" && latest.payload.passed === false;
      const running = ownedJobs.some((job) => job.status === "running") || (agent.slug === "sales" && latest?.type === "sales.started");
      const completed = agent.slug === "sales" ? relatedJobs.some((job) => job.type === "scoper.prd" && job.status !== "canceled") || Boolean(row.project_id) : agent.slug === "intake" ? events.some((event) => event.type === "credential.stored") || ["preview", "done_review", "done", "delivered", "retained"].includes(row.stage ?? "") : ownedJobs[0]?.status === "done" || Boolean(latest && COMPLETED_EVENTS.has(latest.type));
      const state = running ? "running" : failedQa || latest?.type === "sales.failed" || ownedJobs[0]?.status === "failed" ? "blocked" : completed ? "done" : ownedJobs.some((job) => job.status === "queued") || currentAgent === agent.slug ? "waiting" : "unknown";
      return { agent: agent.slug, state, evidence: latest?.id ?? ownedJobs[0]?.id ?? null };
    });
    const currentState = steps.find((step) => step.agent === currentAgent)?.state;
    const status = !row.project_id && row.readiness === "lost" ? "closed" : currentJob?.status === "running" || currentState === "running" ? "running" : currentJob?.status === "failed" || currentState === "blocked" ? "blocked" : pending.length || column === "build" ? "owner" : column === "done" ? "done" : "waiting";
    return {
      id: row.project_id ? `project:${row.project_id}` : `lead:${row.lead_id}`, title: row.title, company: row.company,
      leadId: row.lead_id, projectId: row.project_id, column, stage: row.stage ?? row.readiness ?? "unknown", currentAgent: currentAgent ?? null, status,
      salesPath: text(relatedJobs.find((job) => job.type === "scoper.prd" && ["demo", "meeting"].includes(String(job.payload.path)))?.payload.path) ?? row.engagement_path,
      createdAt: row.created_at.toISOString(), updatedAt: new Date(Math.max(row.updated_at.getTime(), ...relatedJobs.map((job) => new Date(job.updatedAt).getTime()), ...events.map((event) => event.created_at.getTime()))).toISOString(), steps,
      jobs: relatedJobs.map((job) => ({ id: job.id, type: job.type, status: job.status, updatedAt: job.updatedAt, runAt: job.runAt, error: job.lastError })),
      evidence: events.slice(0, 30).map((event) => ({ id: event.id, type: event.type, at: event.created_at.toISOString(), summary: text(event.payload.note) ?? text(event.payload.title) ?? (event.type === "qa.completed" ? event.payload.passed === false ? "QA tidak lulus" : "QA lulus" : null) })),
      approvals: pending.map((approval) => ({ id: approval.id, title: approval.title })),
    };
  });
  const batchRecords = jobs.filter((job) => ["prospecting.scan", "prospecting.daily", "prospecting.live"].includes(job.type) && !["done", "canceled"].includes(job.status)).map((job) => ({
    id: `job:${job.id}`, title: text(job.payload.niche) ?? "Riset prospek harian", company: text(job.payload.location), leadId: null, projectId: null,
    column: "research", stage: job.status, currentAgent: "prospecting", status: job.status === "running" ? "running" : job.status === "failed" ? "blocked" : "waiting",
    createdAt: job.createdAt, updatedAt: job.updatedAt, progress: (job.payload.progress as Record<string, unknown> | undefined) ?? null, steps: AGENT_REGISTRY.map((agent) => ({ agent: agent.slug, state: agent.slug === "prospecting" ? job.status === "running" ? "running" : job.status === "failed" ? "blocked" : "waiting" : "unknown", evidence: agent.slug === "prospecting" ? job.id : null })),
    jobs: [{ id: job.id, type: job.type, status: job.status, updatedAt: job.updatedAt, runAt: job.runAt, error: job.lastError }], evidence: [], approvals: [],
  }));
  return { generatedAt: new Date().toISOString(), limited, columns: BUSINESS_COLUMNS, records: [...batchRecords, ...records] };
}
