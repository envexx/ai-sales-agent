import { ensureSchema } from "../db/schema.js";
import { closePool, query } from "../db/pool.js";
import { countKnowledge, ingestKnowledge } from "../memory/knowledge.js";
import { logger } from "../config/logger.js";
import { seedKnowledge } from "./data.js";

async function main(): Promise<void> {
  await ensureSchema();

  // Idempotent: drop previous seed documents before re-inserting.
  await query(`DELETE FROM knowledge_docs WHERE source = 'seed'`);

  const inserted = await ingestKnowledge(seedKnowledge);
  logger.info(
    { inserted, total: await countKnowledge(), dim: process.env.EMBEDDING_DIM ?? 384 },
    "🌱 seed complete",
  );
}

main()
  .catch((err) => {
    logger.error({ err: (err as Error).stack ?? String(err) }, "seed failed");
    process.exitCode = 1;
  })
  .finally(() => void closePool());
