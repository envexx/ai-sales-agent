-- ─────────────────────────────────────────────────────────────
--  Sales Automation schema (Postgres + pgvector)
--  Idempotent: safe to run on every boot.
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base for RAG (products, pricing, FAQs, playbooks).
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id          BIGSERIAL PRIMARY KEY,
  source      TEXT        NOT NULL DEFAULT 'seed',
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  embedding   vector(384) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_docs_embedding_idx
  ON knowledge_docs USING hnsw (embedding vector_cosine_ops);

-- Long-term memory written by the Reflection Engine.
CREATE TABLE IF NOT EXISTS long_term_memory (
  id          BIGSERIAL PRIMARY KEY,
  lead_id     TEXT,
  wa_jid      TEXT,
  thread_id   TEXT,
  kind        TEXT        NOT NULL DEFAULT 'reflection',
  content     TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  embedding   vector(384) NOT NULL,
  importance  REAL        NOT NULL DEFAULT 0.5,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ltm_embedding_idx
  ON long_term_memory USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ltm_lead_idx ON long_term_memory (lead_id);
CREATE INDEX IF NOT EXISTS ltm_thread_idx ON long_term_memory (thread_id);

-- Leads / CRM-lite.
CREATE TABLE IF NOT EXISTS leads (
  id          TEXT PRIMARY KEY,
  wa_jid      TEXT UNIQUE NOT NULL,
  name        TEXT,
  stage       TEXT        NOT NULL DEFAULT 'new',
  score       INTEGER     NOT NULL DEFAULT 0,
  segment     TEXT,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta        JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- Full conversation transcript.
CREATE TABLE IF NOT EXISTS conversations (
  id          BIGSERIAL PRIMARY KEY,
  lead_id     TEXT,
  thread_id   TEXT NOT NULL,
  role        TEXT NOT NULL,          -- user | assistant | system
  direction   TEXT NOT NULL,          -- inbound | outbound
  content     TEXT NOT NULL,
  meta        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_thread_idx ON conversations (thread_id);
CREATE INDEX IF NOT EXISTS conversations_lead_idx ON conversations (lead_id);

-- Evaluation / critique of each generated response.
CREATE TABLE IF NOT EXISTS evaluations (
  id          BIGSERIAL PRIMARY KEY,
  thread_id   TEXT NOT NULL,
  lead_id     TEXT,
  score       INTEGER,
  payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Booking / follow-up scheduling.
CREATE TABLE IF NOT EXISTS bookings (
  id           BIGSERIAL PRIMARY KEY,
  lead_id      TEXT,
  thread_id    TEXT,
  status       TEXT        NOT NULL DEFAULT 'proposed',
  scheduled_at TIMESTAMPTZ,
  details      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
--  Outbound prospecting (leads imported from outside + outreach)
-- ─────────────────────────────────────────────────────────────

-- Prospect / outreach columns on leads.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS kind              TEXT        NOT NULL DEFAULT 'inbound';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company           TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source            TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes             TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_status   TEXT        NOT NULL DEFAULT 'none';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_attempts INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_outreach_at  TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_out           BOOLEAN     NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS leads_kind_idx ON leads (kind);
CREATE INDEX IF NOT EXISTS leads_outreach_idx
  ON leads (outreach_status, next_follow_up_at);

-- F0.1: status kesiapan lead (gate Sales/outreach).
-- discovered → scouted_ready → in_sales → won | lost | nurture
ALTER TABLE leads ADD COLUMN IF NOT EXISTS readiness TEXT NOT NULL DEFAULT 'discovered';
CREATE INDEX IF NOT EXISTS leads_readiness_idx ON leads (readiness);

-- Migrasi aman: lead lama (inbound atau sudah pernah dikontak) dianggap siap,
-- agar gate baru tidak menghentikan pipeline yang sedang berjalan.
UPDATE leads SET readiness = 'scouted_ready' WHERE readiness = 'discovered' AND kind = 'inbound';
UPDATE leads SET readiness = 'scouted_ready'
  WHERE readiness = 'discovered' AND kind = 'prospect' AND outreach_status <> 'none';

-- One row per outbound message the agent sends to a prospect.
CREATE TABLE IF NOT EXISTS outreach_log (
  id         BIGSERIAL PRIMARY KEY,
  lead_id    TEXT,
  wa_jid     TEXT,
  attempt    INTEGER     NOT NULL DEFAULT 1,
  kind       TEXT        NOT NULL DEFAULT 'opening',
  message    TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'sent',
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_log_lead_idx ON outreach_log (lead_id);

-- ─────────────────────────────────────────────────────────────
--  Research Agent (Universal Research Engine)
--  Metadata only; report + evidence files live in the workspace folder.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS research_reports (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  objective    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'running',   -- running | completed | failed
  format       TEXT NOT NULL DEFAULT 'markdown',  -- markdown | json
  language     TEXT,
  workspace    TEXT,
  summary      TEXT,
  quality      REAL,
  iterations   INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  fact_count   INTEGER NOT NULL DEFAULT 0,
  brief        JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_path  TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_reports_status_idx ON research_reports (status);
CREATE INDEX IF NOT EXISTS research_reports_created_idx ON research_reports (created_at DESC);

-- ─────────────────────────────────────────────────────────────
--  F0: Fondasi orkestrasi bisnis (entitas + event + job + approval)
-- ─────────────────────────────────────────────────────────────

-- Klien (hasil konversi dari lead/prospek).
CREATE TABLE IF NOT EXISTS clients (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT,
  name        TEXT NOT NULL,
  company     TEXT,
  wa_jid      TEXT,
  email       TEXT,
  status      TEXT NOT NULL DEFAULT 'active',   -- active | churned
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Proyek/pekerjaan per klien (dari PRD sampai retainer).
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  client_id   TEXT,
  title       TEXT NOT NULL,
  stage       TEXT NOT NULL DEFAULT 'scoping',  -- scoping|building|qa|handover|delivered|retained
  prd_path    TEXT,
  workspace   TEXT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_client_idx ON projects (client_id);
CREATE INDEX IF NOT EXISTS projects_stage_idx ON projects (stage);

-- Invoice (DP, pelunasan, retainer).
CREATE TABLE IF NOT EXISTS invoices (
  id          TEXT PRIMARY KEY,
  client_id   TEXT,
  project_id  TEXT,
  kind        TEXT NOT NULL DEFAULT 'dp',       -- dp | final | retainer
  amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'IDR',
  status      TEXT NOT NULL DEFAULT 'draft',    -- draft|sent|paid|overdue|canceled
  due_at      TIMESTAMPTZ,
  paid_at     TIMESTAMPTZ,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status, due_at);

-- Tiket dukungan (L1 Support & Triage).
CREATE TABLE IF NOT EXISTS tickets (
  id          TEXT PRIMARY KEY,
  client_id   TEXT,
  project_id  TEXT,
  channel     TEXT,
  severity    TEXT NOT NULL DEFAULT 'l1',       -- l1 | l2 | emergency
  status      TEXT NOT NULL DEFAULT 'open',     -- open | resolved | escalated
  subject     TEXT,
  body        TEXT,
  resolution  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status, severity);

-- Vault kredensial (terenkripsi AES-256-GCM).
CREATE TABLE IF NOT EXISTS credentials (
  id          TEXT PRIMARY KEY,
  client_id   TEXT,
  project_id  TEXT,
  name        TEXT NOT NULL,
  cipher      TEXT NOT NULL,
  hint        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credentials_client_idx ON credentials (client_id);

-- Event log / outbox (observability + pemicu workflow).
CREATE TABLE IF NOT EXISTS events (
  id           BIGSERIAL PRIMARY KEY,
  type         TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_type_idx ON events (type, created_at DESC);
CREATE INDEX IF NOT EXISTS events_entity_idx ON events (entity_type, entity_id);

-- Antrean job terjadwal (dipakai scheduler).
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'queued', -- queued|running|done|failed|canceled
  priority      INTEGER NOT NULL DEFAULT 0,
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  run_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at     TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_due_idx ON jobs (status, run_at);
-- Idempotensi: satu job untuk satu (type, dedupeKey).
CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe_idx
  ON jobs (type, (payload->>'dedupeKey')) WHERE (payload ? 'dedupeKey');

-- Persetujuan (human-in-the-loop) — Anda sebagai owner.
CREATE TABLE IF NOT EXISTS approvals (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  summary       TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|expired
  requested_by  TEXT,
  decided_by    TEXT,
  decision_note TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals (status, created_at DESC);

-- Pemetaan kanal klien (mis. Telegram chat_id → proyek) untuk L1 Support.
CREATE TABLE IF NOT EXISTS client_channels (
  id          TEXT PRIMARY KEY,
  channel     TEXT NOT NULL DEFAULT 'telegram',
  external_id TEXT NOT NULL,
  client_id   TEXT,
  project_id  TEXT,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, external_id)
);
CREATE INDEX IF NOT EXISTS client_channels_project_idx ON client_channels (project_id);

-- F0.5: transkrip/notes meeting (jalur Sales = meeting) — sumber PRD Scoper.
CREATE TABLE IF NOT EXISTS meeting_notes (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT,
  project_id  TEXT,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_notes_lead_idx ON meeting_notes (lead_id);

-- F0.6: link intake aman (token + expiry) untuk pengumpulan kredensial.
CREATE TABLE IF NOT EXISTS intake_links (
  id           TEXT PRIMARY KEY,
  token        TEXT UNIQUE NOT NULL,
  project_id   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | submitted | expired
  items        JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at   TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intake_links_project_idx ON intake_links (project_id);

-- Continuous improvement: pelajaran otomatis + usulan perbaikan per agent.
CREATE TABLE IF NOT EXISTS agent_improvements (
  id         BIGSERIAL PRIMARY KEY,
  agent      TEXT NOT NULL,                       -- slug agent
  kind       TEXT NOT NULL,                       -- 'lesson' | 'suggestion'
  status     TEXT NOT NULL DEFAULT 'proposed',    -- proposed | approved | rejected | applied
  title      TEXT NOT NULL,
  detail     TEXT NOT NULL,
  evidence   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT
);
CREATE INDEX IF NOT EXISTS agent_improvements_agent_idx ON agent_improvements (agent, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_improvements_status_idx ON agent_improvements (status);

-- Percakapan owner ⇄ Supervisor (memori obrolan penasihat strategis).
CREATE TABLE IF NOT EXISTS supervisor_chat (
  id         BIGSERIAL PRIMARY KEY,
  role       TEXT NOT NULL,      -- 'owner' | 'supervisor'
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supervisor_chat_created_idx ON supervisor_chat (created_at DESC);

-- D4 · Developer: target yang dikelola (situs/repo/otomasi) + status audit/deploy.
CREATE TABLE IF NOT EXISTS dev_targets (
  id            TEXT PRIMARY KEY,
  project_id    TEXT,
  client_id     TEXT,
  kind          TEXT        NOT NULL DEFAULT 'site',   -- site | repo | automation
  name          TEXT        NOT NULL,
  repo_url      TEXT,
  live_url      TEXT,
  local_path    TEXT,
  platform      TEXT,                                   -- vercel | cloudflare | netlify | ...
  status        TEXT        NOT NULL DEFAULT 'active',  -- active | paused | archived
  meta          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  last_audit_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dev_targets_project_idx ON dev_targets (project_id);
CREATE INDEX IF NOT EXISTS dev_targets_status_idx ON dev_targets (status);
