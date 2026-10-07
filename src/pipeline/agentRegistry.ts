/**
 * Registry semua agent sistem (1 Supervisor + 13 worker), dipakai dashboard
 * untuk menampilkan status per-agent dan navigasi.
 *
 * `jobTypes` dan `eventTypes` memetakan aktivitas nyata (job queue + event log)
 * ke agent terkait, sehingga status bisa dihitung dari data, bukan hardcode.
 */
export interface AgentDataLink {
  label: string;
  href: string;
}

export interface AgentRegistryEntry {
  slug: string;
  name: string;
  divisionCode: string;
  division: string;
  role: string;
  /** Bagaimana agent dipicu. */
  trigger: string;
  /** Kunci env yang mengaktifkan/menonaktifkan agent (opsional). */
  enabledKey?: string;
  jobTypes: string[];
  eventTypes: string[];
  /** Jenis approval yang menunggu keputusan agent ini (opsional). */
  approvalKinds?: string[];
  dataLinks: AgentDataLink[];
}

export const AGENT_REGISTRY: AgentRegistryEntry[] = [
  {
    slug: "supervisor",
    name: "Supervisor",
    divisionCode: "D0",
    division: "Command Center",
    role: "Memantau, mengoreksi penyimpangan, dan merangkum laporan harian agent.",
    trigger: "Job harian (pantau + rangkum)",
    jobTypes: ["briefing", "supervisor.review"],
    eventTypes: ["briefing.sent", "supervisor.review"],
    dataLinks: [
      { label: "Aktivitas", href: "/pipeline" },
      { label: "Approval", href: "/approvals" },
    ],
  },
  {
    slug: "prospecting",
    name: "Research & Scout",
    divisionCode: "D1",
    division: "Growth & Acquisition",
    role: "Cari prospek bisnis (Google Maps + Tavily) lalu audit pain-point & sudut outreach.",
    trigger: "Job `prospecting.scan|daily` → `scout.audit|daily`",
    enabledKey: "PROSPECTING_ENABLED",
    jobTypes: ["prospecting.scan", "prospecting.daily", "scout.audit", "scout.daily"],
    eventTypes: [
      "prospecting.completed",
      "prospect.discovered",
      "prospect.scouted",
      "lead.scouted_ready",
    ],
    dataLinks: [{ label: "Leads", href: "/leads" }],
  },
  {
    slug: "sales",
    name: "Sales (Nadia)",
    divisionCode: "D1",
    division: "Growth & Acquisition",
    role: "Percakapan WhatsApp, kualifikasi, booking, outreach.",
    trigger: "Pesan masuk + penjadwal outreach",
    jobTypes: ["sales.clarify"],
    eventTypes: ["sales.started", "sales.completed", "sales.failed", "lead.in_sales", "sales.outreach", "lead.inbound_new", "lead.inbound_reply"],
    dataLinks: [
      { label: "Leads", href: "/leads" },
      { label: "Kualitas", href: "/agents/sales?tab=kualitas" },
      { label: "Booking", href: "/agents/sales?tab=booking" },
      { label: "Workflow", href: "/agents/sales?tab=workflow" },
    ],
  },
  {
    slug: "scoper",
    name: "Scoper & PRD",
    divisionCode: "D2",
    division: "Deal Desk",
    role: "Transkrip → PRD + checklist teknis.",
    trigger: "Job `scoper.prd` (booking confirmed)",
    enabledKey: "SCOPER_ENABLED",
    jobTypes: ["scoper.prd"],
    eventTypes: ["prd.ready", "prd.clarify_requested"],
    dataLinks: [{ label: "Proyek", href: "/projects" }],
  },
  {
    slug: "legal",
    name: "Legal & Finance",
    divisionCode: "D2",
    division: "Deal Desk",
    role: "PRD → SPK/NDA + invoice DP, verifikasi pembayaran.",
    trigger: "Job `legal.draft` / perintah owner",
    enabledKey: "LEGAL_ENABLED",
    jobTypes: ["legal.draft"],
    eventTypes: ["legal.ready", "invoice.dp_paid", "invoice.final_paid"],
    dataLinks: [
      { label: "Proyek", href: "/projects" },
      { label: "Invoice", href: "/invoices" },
    ],
  },
  {
    slug: "intake",
    name: "Intake & Credential",
    divisionCode: "D2",
    division: "Deal Desk",
    role: "Formulir akses + vault kredensial terenkripsi.",
    trigger: "Job `intake.collect` (event invoice.dp_paid)",
    enabledKey: "INTAKE_ENABLED",
    jobTypes: ["intake.collect"],
    eventTypes: ["intake.requested", "credential.stored"],
    dataLinks: [{ label: "Proyek", href: "/projects" }],
  },
  {
    slug: "qa",
    name: "QA & Documentation",
    divisionCode: "D3",
    division: "Delivery & Quality",
    role: "Uji kelayakan rilis (webhook, JSON, guardrail) lalu susun SOP & panduan pengguna.",
    trigger: "Job `qa.run` → (lulus) `scribe.docs`",
    enabledKey: "QA_ENABLED",
    jobTypes: ["qa.run", "scribe.docs"],
    eventTypes: ["qa.completed", "docs.ready"],
    dataLinks: [{ label: "Proyek", href: "/projects" }],
  },
  {
    slug: "handover",
    name: "Handover & Final Invoice",
    divisionCode: "D4",
    division: "Client Success & Developer",
    role: "BAST + invoice pelunasan (butuh persetujuan).",
    trigger: "Job `handover.finalize` (event docs.ready)",
    enabledKey: "HANDOVER_ENABLED",
    jobTypes: ["handover.finalize"],
    eventTypes: ["handover.ready"],
    approvalKinds: ["handover.send"],
    dataLinks: [
      { label: "Proyek", href: "/projects" },
      { label: "Approval", href: "/approvals" },
    ],
  },
  {
    slug: "support",
    name: "L1 Support & Triage",
    divisionCode: "D4",
    division: "Client Success & Developer",
    role: "Triage keluhan klien, jawab dari SOP, eskalasi.",
    trigger: "Keluhan klien via Sales (relay)",
    enabledKey: "SUPPORT_ENABLED",
    jobTypes: ["support.triage"],
    eventTypes: ["support.ticket", "support.escalated"],
    dataLinks: [{ label: "Tiket", href: "/tickets" }],
  },
  {
    slug: "monitor",
    name: "Monitor Layanan & Agent",
    divisionCode: "D4",
    division: "Client Success & Developer",
    role: "Pantau infra/biaya + kinerja & kesehatan agent (job gagal, rasio sukses, usulan perbaikan).",
    trigger: "Job `monitor.check` (harian)",
    enabledKey: "MONITOR_ENABLED",
    jobTypes: ["monitor.check"],
    eventTypes: ["monitor.check", "monitor.alert"],
    dataLinks: [{ label: "Aktivitas", href: "/pipeline" }],
  },
  {
    slug: "developer",
    name: "Developer & Automation",
    divisionCode: "D4",
    division: "Client Success & Developer",
    role: "Kelola & tingkatkan situs/web terpasang (SEO, performa, keamanan) serta bangun otomasi & AI agent. Engine: OpenCode; tools: GitHub, Vercel, Cloudflare, Supabase, Search Console, Analytics.",
    trigger: "Job `developer.maintain` (pelunasan) · `developer.build` (tugas owner) · `developer.sweep` (harian)",
    enabledKey: "DEVELOPER_ENABLED",
    jobTypes: [
      "developer.maintain",
      "developer.build",
      "developer.sweep",
      "developer.apply",
      "developer.deploy",
    ],
    eventTypes: [
      "developer.target_registered",
      "developer.plan_ready",
      "developer.applied",
      "developer.pr_opened",
      "developer.deployed",
      "developer.sweep",
    ],
    approvalKinds: ["developer.apply", "developer.deploy"],
    dataLinks: [
      { label: "Proyek", href: "/projects" },
      { label: "Approval", href: "/approvals" },
    ],
  },
  {
    slug: "content",
    name: "Case Study & Content",
    divisionCode: "D5",
    division: "Brand & Flywheel",
    role: "Studi kasus → knowledge base (flywheel).",
    trigger: "Job `content.case_study` (event invoice.final_paid)",
    enabledKey: "CONTENT_ENABLED",
    jobTypes: ["content.case_study"],
    eventTypes: ["content.ready", "case_study.ingested"],
    dataLinks: [{ label: "Knowledge", href: "/knowledge" }],
  },
];

/** Nama persona setiap agent (mis. Nadia untuk Sales) — dipakai UI/office. */
export const AGENT_PERSONAS: Record<string, string> = {
  supervisor: "Bima",
  prospecting: "Sari",
  sales: "Nadia",
  scoper: "Rangga",
  legal: "Vera",
  intake: "Galih",
  qa: "Ayu",
  handover: "Bayu",
  support: "Tirta",
  monitor: "Wira",
  developer: "Adit",
  content: "Maya",
};

export function findAgent(slug: string): AgentRegistryEntry | undefined {
  return AGENT_REGISTRY.find((a) => a.slug === slug);
}

/** Handoff bisnis; status diterima hanya bila terdapat bukti pada entitas yang sama. */
export const AGENT_HANDOFFS: Record<string, string[]> = {
  supervisor: [], prospecting: ["sales"], sales: ["scoper", "support"],
  scoper: ["legal"], legal: ["intake"], intake: ["qa"], qa: ["handover"],
  handover: ["developer", "content"], support: ["sales"],
  monitor: [], developer: [], content: [],
};

/** Semua tipe job & event yang dirujuk registry (untuk query batch). */
export const ALL_JOB_TYPES = [...new Set(AGENT_REGISTRY.flatMap((a) => a.jobTypes))];
export const ALL_EVENT_TYPES = [...new Set(AGENT_REGISTRY.flatMap((a) => a.eventTypes))];
export const ALL_APPROVAL_KINDS = [
  ...new Set(AGENT_REGISTRY.flatMap((a) => a.approvalKinds ?? [])),
];
