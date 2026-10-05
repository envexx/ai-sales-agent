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
