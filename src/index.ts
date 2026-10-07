import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { closePool } from "./db/pool.js";
import { createServer } from "./api/server.js";
import { startRuntime, stopRuntime } from "./runtime.js";

async function main(): Promise<void> {
  logger.info("starting sales automation agent...");

  // HTTP API (runtime + agent schedulers dijalankan oleh startRuntime()).
  const app = createServer();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "HTTP API listening");
    logger.info(`  POST /webhook/whatsapp   POST /webhook/leads    POST /simulate`);
    logger.info(`  GET  /health             GET  /leads             GET  /prospects`);
    logger.info(`  GET  /whatsapp/status    POST /whatsapp/connect  GET  /whatsapp/events`);
    logger.info(`  GET  /outreach           POST /outreach/tick     GET  /graph/mermaid`);
    logger.info(`  GET  /agents             GET  /supervisor/mermaid`);
    logger.info(`  POST /research           GET  /research             GET  /research/:id`);
    logger.info(`  GET  /pipeline/jobs      POST /pipeline/tick        GET  /approvals`);
  });

  await startRuntime();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down...");
    await stopRuntime();
    server.close();
    await closePool().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err: (err as Error).stack ?? String(err) }, "fatal startup error");
  process.exit(1);
});
