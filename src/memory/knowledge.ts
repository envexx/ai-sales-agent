import { getEmbedder, toVectorLiteral } from "../embedding/index.js";
import { query } from "../db/pool.js";
import { loggerFor } from "../config/logger.js";
import type { RetrievedDoc } from "../types.js";

const log = loggerFor("memory:knowledge");

export interface KnowledgeInput {
  title: string;
  content: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

interface KnowledgeRow {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

export async function countKnowledge(): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM knowledge_docs`,
  );
  return Number(rows[0]?.count ?? 0);
}

/** Embed and insert a batch of knowledge documents. */
export async function ingestKnowledge(docs: KnowledgeInput[]): Promise<number> {
  if (docs.length === 0) return 0;
  const embedder = getEmbedder();
  const vectors = await embedder.embedDocuments(docs.map((d) => `${d.title}\n${d.content}`));

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;
    await query(
      `INSERT INTO knowledge_docs (source, title, content, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        doc.source ?? "seed",
        doc.title,
        doc.content,
        JSON.stringify(doc.metadata ?? {}),
        toVectorLiteral(vectors[i]!),
      ],
    );
  }
  log.info({ count: docs.length }, "knowledge ingested");
  return docs.length;
}

/** Semantic search over the knowledge base. */
export async function retrieveKnowledge(
  queryText: string,
  k: number,
): Promise<RetrievedDoc[]> {
  const embedder = getEmbedder();
  const vector = await embedder.embedQuery(queryText);
  const { rows } = await query<KnowledgeRow>(
    `SELECT id::text, title, content, metadata,
            1 - (embedding <=> $1::vector) AS score
     FROM knowledge_docs
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [toVectorLiteral(vector), k],
  );
  return rows.map((r) => ({
    id: r.id,
    source: "knowledge" as const,
    title: r.title,
    content: r.content,
    score: Number(r.score),
    metadata: r.metadata,
  }));
}

/* ─────────────────────── listing / flywheel ──────────────────────── */

export interface KnowledgeListItem {
  id: string;
  source: string;
  title: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** Cuplikan isi dokumen untuk tampilan daftar. */
  preview: string;
}

export async function listKnowledge(
  limit = 100,
  source?: string,
): Promise<KnowledgeListItem[]> {
  const rows = source
    ? (
        await query<{
          id: string;
          source: string;
          title: string;
          preview: string;
          metadata: Record<string, unknown>;
          created_at: Date;
        }>(
          `SELECT id::text, source, title, left(content, 200) AS preview, metadata, created_at
           FROM knowledge_docs WHERE source=$2 ORDER BY id DESC LIMIT $1`,
          [limit, source],
        )
      ).rows
    : (
        await query<{
          id: string;
          source: string;
          title: string;
          preview: string;
          metadata: Record<string, unknown>;
          created_at: Date;
        }>(
          `SELECT id::text, source, title, left(content, 200) AS preview, metadata, created_at
           FROM knowledge_docs ORDER BY id DESC LIMIT $1`,
          [limit],
        )
      ).rows;

  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    title: r.title,
    metadata: r.metadata ?? {},
    createdAt: r.created_at.toISOString(),
    preview: r.preview ?? "",
  }));
}

export interface KnowledgeDocDetail extends KnowledgeListItem {
  content: string;
}

/** Ambil satu dokumen knowledge beserta isi lengkapnya. */
export async function getKnowledgeById(id: string): Promise<KnowledgeDocDetail | null> {
  const { rows } = await query<{
    id: string;
    source: string;
    title: string;
    content: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id::text, source, title, content, metadata, created_at
     FROM knowledge_docs WHERE id::text = $1 LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    source: r.source,
    title: r.title,
    content: r.content,
    metadata: r.metadata ?? {},
    createdAt: r.created_at.toISOString(),
    preview: r.content.slice(0, 200),
  };
}

export async function countKnowledgeBySource(): Promise<Record<string, number>> {
  const { rows } = await query<{ key: string; count: number }>(
    `SELECT source AS key, count(*)::int AS count FROM knowledge_docs GROUP BY 1`,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.count]));
}

/** Apakah studi kasus untuk proyek ini sudah pernah di-ingest (flywheel). */
export async function caseStudyExists(projectId: string): Promise<boolean> {
  const { rows } = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM knowledge_docs
     WHERE source='case_study' AND metadata->>'projectId' = $1`,
    [projectId],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}
