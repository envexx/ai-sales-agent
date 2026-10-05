const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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

export const api = {
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
};

export { API_URL };
