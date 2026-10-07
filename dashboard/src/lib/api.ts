const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type Segment = "nurture" | "objection" | "closing" | null;

export interface Lead {
  id: string;
  waJid: string;
  name: string | null;
  stage: string;
  score: number;
  segment: Segment;
  firstSeen: string;
  lastSeen: string;
  meta: Record<string, unknown>;
  kind: "inbound" | "prospect";
  company: string | null;
  source: string | null;
  notes: string | null;
  outreachStatus: string;
  outreachAttempts: number;
  lastOutreachAt: string | null;
  nextFollowUpAt: string | null;
  optOut: boolean;
}

export type WaState = "idle" | "connecting" | "qr" | "connected" | "logged_out";

export interface WaStatus {
  transport: string;
  state: WaState;
  qrDataUrl: string | null;
  me: { id: string; name: string | null } | null;
  lastError: string | null;
  updatedAt: string;
}

export interface ImportLeadInput {
  name?: string | null;
  phone: string;
  company?: string | null;
  source?: string | null;
  notes?: string | null;
  queue?: boolean;
}

export interface ImportResult {
  created: number;
  failed: number;
  leads: { id: string; waJid: string; name: string | null; outreachStatus: string }[];
  errors: { phone: string; error: string }[];
}

export interface OutreachLogItem {
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

export interface OutreachOverview {
  stats: Record<string, number>;
  log: OutreachLogItem[];
  workingHours: string;
}

export interface TickResult {
  ran: boolean;
  reason?: string;
  sent: number;
  withinWorkingHours: boolean;
  results: Array<{ leadId: string; name: string | null; attempt: number; status: string; message: string }>;
}

export interface ConversationMessage {
  role: string;
  direction: string;
  content: string;
  createdAt: string;
}

export interface EvaluationPayload {
  evaluation?: {
    relevance?: number;
    groundedness?: number;
    tone?: number;
    conversionLikelihood?: number;
    overall?: number;
    strengths?: string[] | string;
    improvements?: string[] | string;
    critique?: string;
  };
}

export interface EvaluationItem {
  id: string;
  threadId: string;
  leadId: string | null;
  overall: number | null;
  payload: EvaluationPayload;
  createdAt: string;
}

export interface BookingItem {
  id: string;
  leadId: string | null;
  threadId: string | null;
  status: string;
  scheduledAt: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

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
  recentEvaluations: EvaluationItem[];
}

export interface LeadDetail {
  lead: Lead;
  threadId: string;
  messages: ConversationMessage[];
  evaluations: EvaluationItem[];
  bookings: BookingItem[];
}

export interface Health {
  ok: boolean;
  transport: string;
  dryRun: boolean;
  embedding: string;
  model: string;
}

/* ── Pipeline / proyek / tiket / approval (F0–F5) ─────────────────── */

export interface PipelineSnapshot {
  generatedAt: string;
  leads: number;
  conversations: number;
  segments: Record<string, number>;
  outreach: Record<string, number>;
  researchReports: number;
  researchLast24h: number;
  projectStages: Record<string, number>;
  approvalsPending: number;
  ticketsOpen: Record<string, number>;
  llmProvider: string;
  dryRun: boolean;
  transport: string;
}

export interface JobItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventItem {
  id: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ProjectItem {
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

export interface ProjectDocument { path: string; name: string; group: string; bytes: number; updatedAt: string; }
export interface ProjectDetail {
  project: Pick<ProjectItem, "id" | "title" | "stage" | "createdAt" | "updatedAt">;
  client: { name: string; company: string | null; leadId: string | null } | null;
  context: Record<string, string | string[]>;
  documents: ProjectDocument[];
  invoices: Pick<InvoiceItem, "id" | "kind" | "amount" | "currency" | "status" | "dueAt" | "paidAt">[];
  jobs: { id: string; type: string; status: string; updatedAt: string }[];
  events: { id: string; type: string; at: string }[];
}

export interface TicketItem {
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

export interface ApprovalItem {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  status: string;
  requestedBy: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  expiresAt: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface InvoiceItem {
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

export interface KnowledgeItem {
  id: string;
  source: string;
  title: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  preview: string;
}

export interface KnowledgeDoc extends KnowledgeItem {
  content: string;
}

export interface AgentGrowth {
  slug: string; name: string; divisionCode: string;
  done: number; failed: number; running: number; queued: number;
  donePrev: number; failedPrev: number; successRate: number | null; trend: number;
  lessons7d: number; suggestionsPending: number; suggestionsApplied: number;
}
export interface Improvement {
  id: string; agent: string; kind: "lesson" | "suggestion"; status: string;
  title: string; detail: string; evidence: Record<string, unknown>;
  createdAt: string; decidedAt: string | null;
}

export interface SupervisorMessage {
  role: "owner" | "supervisor";
  content: string;
  createdAt?: string;
}

/* ── Agent registry & status ──────────────────────────────────────── */

export type AgentLiveStatus = "idle" | "working" | "queued" | "error" | "disabled";

export interface AgentDataLink {
  label: string;
  href: string;
}

export interface AgentSummary {
  slug: string;
  name: string;
  persona: string;
  divisionCode: string;
  division: string;
  role: string;
  trigger: string;
  dataLinks: AgentDataLink[];
  enabled: boolean;
}

export interface AgentStatus extends AgentSummary {
  status: AgentLiveStatus;
  jobs: { queued: number; running: number; done: number; failed: number };
  lastJobAt: string | null;
  lastEventAt: string | null;
  lastEventType: string | null;
  approvalsPending: number;
  jobTypes: string[];
  eventTypes: string[];
}

export type WorkflowState = "waiting" | "running" | "done" | "blocked" | "unknown";
export interface AgentWorkflowTask {
  id: string; title: string; status: string; receivedAt: string; updatedAt: string;
  scheduledAt: string | null; workState: WorkflowState; resultState: WorkflowState;
  result: string; error: string | null; entity: { type: string; id: string } | null;
  evidence: { id: string; type: string; at: string; summary: string }[];
  handoffs: { agent: string; name: string; state: WorkflowState; taskId: string | null; proof: string | null }[];
}
export interface AgentWorkflow { slug: string; generatedAt: string; tasks: AgentWorkflowTask[] }

export interface BusinessProgress {
  phase: string; niche: string; location: string;
  total: number; processed: number; enriched: number; saved: number; skipped: number; excluded: number;
  duplicates?: number;
  message?: string;
}
export interface BusinessRecord {
  salesPath?: string | null;
  id: string; title: string; company: string | null; leadId: string | null; projectId: string | null;
  column: string; stage: string; currentAgent: string | null; status: string; createdAt: string; updatedAt: string;
  progress?: BusinessProgress | null;
  steps: { agent: string; state: WorkflowState; evidence: string | null }[];
  jobs: { id: string; type: string; status: string; updatedAt: string; runAt: string; error: string | null }[];
  evidence: { id: string; type: string; at: string; summary: string | null }[];
  approvals: { id: string; title: string }[];
}
export interface BusinessBoard {
  generatedAt: string; limited: boolean;
  columns: { id: string; label: string; agent: string }[];
  records: BusinessRecord[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API ${path} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((json.error as string) ?? `API ${path} → ${res.status}`);
  }
  return json as T;
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((json.error as string) ?? `API ${path} → ${res.status}`);
  }
  return json as T;
}

export const api = {
  businessBoard: () => get<BusinessBoard>("/business/board"),
  health: () => get<Health>("/health"),
  metrics: () => get<Metrics>("/metrics"),
  leads: () => get<{ leads: Lead[] }>("/leads").then((r) => r.leads),
  lead: (id: string) => get<LeadDetail>(`/leads/${id}`),
  evaluations: (limit = 50) =>
    get<{ evaluations: EvaluationItem[] }>(`/evaluations?limit=${limit}`).then(
      (r) => r.evaluations,
    ),
  bookings: (limit = 50) =>
    get<{ bookings: BookingItem[] }>(`/bookings?limit=${limit}`).then((r) => r.bookings),

  /* WhatsApp connection */
  whatsappStatus: () => get<WaStatus>("/whatsapp/status"),
  whatsappConnect: () => post<WaStatus>("/whatsapp/connect"),
  whatsappDisconnect: () => post<WaStatus>("/whatsapp/disconnect"),
  whatsappLogout: () => post<WaStatus>("/whatsapp/logout"),

  /* Lead intake & outreach */
  prospects: () => get<{ prospects: Lead[] }>("/prospects").then((r) => r.prospects),
  outreach: (limit = 50) => get<OutreachOverview>(`/outreach?limit=${limit}`),
  importLeads: (body: ImportLeadInput | { leads: ImportLeadInput[] }) =>
    post<ImportResult>("/webhook/leads", body),
  runOutreachTick: (force = false) =>
    post<TickResult>(`/outreach/tick${force ? "?force=true" : ""}`),
  queueLead: (id: string) => post<{ ok: boolean }>(`/leads/${id}/queue`),
  optOutLead: (id: string) => post<{ ok: boolean }>(`/leads/${id}/opt-out`),

  /* Pipeline & orchestrator */
  pipelineSnapshot: () => get<PipelineSnapshot>("/pipeline/snapshot"),
  jobs: (limit = 50, agent?: string) =>
    get<{ jobs: JobItem[] }>(`/pipeline/jobs?limit=${limit}${agent ? `&agent=${encodeURIComponent(agent)}` : ""}`).then((r) => r.jobs),
  events: (limit = 80, agent?: string) =>
    get<{ events: EventItem[] }>(`/pipeline/events?limit=${limit}${agent ? `&agent=${encodeURIComponent(agent)}` : ""}`).then((r) => r.events),
  jobTypes: () => get<{ types: string[] }>("/pipeline/job-types").then((r) => r.types),
  pipelineTick: () => post<{ processed: number }>("/pipeline/tick"),
  enqueueJob: (type: string, payload?: Record<string, unknown>) =>
    post<{ ok: boolean; id: string | null; deduped: boolean }>("/pipeline/jobs", {
      type,
      payload,
    }),

  /* Proyek, invoice, tiket, approval */
  projects: () => get<{ projects: ProjectItem[] }>("/projects").then((r) => r.projects),
  project: (id: string) => get<ProjectDetail>(`/projects/${encodeURIComponent(id)}`),
  projectDocument: (id: string, path: string) => get<ProjectDocument & { content: string | null; tooLarge: boolean }>(`/projects/${encodeURIComponent(id)}/documents?path=${encodeURIComponent(path)}`),
  invoices: () => get<{ invoices: InvoiceItem[] }>("/invoices").then((r) => r.invoices),
  tickets: () => get<{ tickets: TicketItem[] }>("/tickets").then((r) => r.tickets),
  approvals: (status?: string) =>
    get<{ approvals: ApprovalItem[] }>(`/approvals${status ? `?status=${status}` : ""}`).then(
      (r) => r.approvals,
    ),
  approve: (id: string, note?: string) =>
    post<ApprovalItem>(`/approvals/${id}/approve`, note ? { note } : {}),
  reject: (id: string, note?: string) =>
    post<ApprovalItem>(`/approvals/${id}/reject`, note ? { note } : {}),

  /* Knowledge base (flywheel) */
  knowledge: () =>
    get<{ total: Record<string, number>; docs: KnowledgeItem[] }>("/knowledge"),
  knowledgeDoc: (id: string) => get<KnowledgeDoc>(`/knowledge/${id}`),

  /* Pertumbuhan & perbaikan agent (continuous improvement) */
  growth: (days = 14) => get<{ days: number; agents: AgentGrowth[] }>(`/agents/growth?days=${days}`),
  improvements: (status?: string) =>
    get<{ improvements: Improvement[] }>(
      `/improvements${status ? `?status=${status}` : ""}`,
    ).then((r) => r.improvements),
  runOptimize: () => post<{ generated: number; agents: string[] }>("/agents/optimize"),
  approveImprovement: (id: string) => post<Improvement>(`/improvements/${id}/approve`),
  rejectImprovement: (id: string) => post<Improvement>(`/improvements/${id}/reject`),

  /* Supervisor (penasihat) */
  supervisorProfile: () =>
    get<{ profile: string }>("/supervisor/profile").then((r) => r.profile),
  setSupervisorProfile: (profile: string) => put<{ ok: boolean }>("/supervisor/profile", { profile }),
  supervisorChat: () =>
    get<{ messages: SupervisorMessage[] }>("/supervisor/chat").then((r) => r.messages),
  supervisorAsk: (message: string) => post<{ reply: string }>("/supervisor/chat", { message }),

  /* Agent registry & status */
  agents: () => get<{ agents: AgentSummary[] }>("/agents").then((r) => r.agents),
  agentsStatus: () =>
    get<{ agents: AgentStatus[]; generatedAt: string }>("/agents/status").then((r) => r.agents),
  agentWorkflow: (slug: string) => get<AgentWorkflow>(`/agents/${encodeURIComponent(slug)}/workflow`),
};

export { API_URL };

