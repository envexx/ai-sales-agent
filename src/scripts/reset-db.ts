// Drop every table created by the app and the LangGraph checkpointer.
const { query, closePool } = await import("../db/pool.js");
const { logger } = await import("../config/logger.js");

const TABLES = [
  "conversations",
  "evaluations",
  "bookings",
  "long_term_memory",
  "knowledge_docs",
  "leads",
  "checkpoint_writes",
  "checkpoint_blobs",
  "checkpoint_migrations",
  "checkpoints",
];

try {
  for (const table of TABLES) {
    await query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
  logger.info({ tables: TABLES.length }, "🗑️  database reset complete");
} catch (err) {
  logger.error({ err: (err as Error).message }, "reset failed");
  process.exitCode = 1;
} finally {
  await closePool();
}
