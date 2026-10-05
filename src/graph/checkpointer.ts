import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("graph:checkpointer");

let saver: PostgresSaver | null = null;

/**
 * LangGraph persistence backed by Postgres. This is what makes multi-turn
 * conversation memory work: every thread_id keeps its own state snapshot.
 */
export async function getCheckpointer(): Promise<PostgresSaver> {
  if (saver) return saver;
  saver = PostgresSaver.fromConnString(env.DATABASE_URL, {
    schema: env.CHECKPOINT_SCHEMA,
  });
  await saver.setup();
  log.info({ schema: env.CHECKPOINT_SCHEMA }, "checkpointer ready");
  return saver;
}
