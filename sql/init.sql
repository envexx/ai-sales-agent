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
