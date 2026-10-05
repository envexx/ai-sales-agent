import { getEmbedder, toVectorLiteral } from "../embedding/index.js";
import { query } from "../db/pool.js";
import { loggerFor } from "../config/logger.js";
import type { RetrievedDoc } from "../types.js";

const log = loggerFor("memory:ltm");

export interface MemoryInput {
  leadId?: string | null;
  waJid?: string | null;
  threadId?: string | null;
  kind?: string;
  content: string;
  metadata?: Record<string, unknown>;
  importance?: number;
}

interface MemoryRow {
  id: string;
  lead_id: string | null;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  importance: number;
  score: number;
}

/** Persist a reflection / fact / preference into long-term memory. */
export async function writeMemory(input: MemoryInput): Promise<string> {
  const embedder = getEmbedder();
  const [vector] = await embedder.embedDocuments([input.content]);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO long_term_memory
       (lead_id, wa_jid, thread_id, kind, content, metadata, embedding, importance)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id::text`,
    [
      input.leadId ?? null,
      input.waJid ?? null,
      input.threadId ?? null,
      input.kind ?? "reflection",
      input.content,
      JSON.stringify(input.metadata ?? {}),
      toVectorLiteral(vector!),
      input.importance ?? 0.5,
    ],
  );
  log.debug({ id: rows[0]?.id, kind: input.kind }, "memory written");
  return rows[0]!.id;
}

/**
 * Retrieve relevant memories. Prefers memories tied to the same lead, then
 * falls back to globally relevant lessons from past conversations.
 */
export async function retrieveMemory(params: {
  queryText: string;
  leadId?: string | null;
  k: number;
}): Promise<RetrievedDoc[]> {
  const embedder = getEmbedder();
  const vector = await embedder.embedQuery(params.queryText);
  const { rows } = await query<MemoryRow>(
    `SELECT id::text, lead_id, kind, content, metadata, importance,
            1 - (embedding <=> $1::vector) AS score
     FROM long_term_memory
     WHERE ($2::text IS NULL OR lead_id = $2 OR lead_id IS NULL)
     ORDER BY (embedding <=> $1::vector) - (importance * 0.05)
     LIMIT $3`,
    [toVectorLiteral(vector), params.leadId ?? null, params.k],
  );
  return rows.map((r) => ({
    id: r.id,
    source: "memory" as const,
    title: `${r.kind}${r.lead_id ? ` · ${r.lead_id.slice(0, 8)}` : ""}`,
    content: r.content,
    score: Number(r.score),
    metadata: { ...r.metadata, kind: r.kind, importance: r.importance },
  }));
}
