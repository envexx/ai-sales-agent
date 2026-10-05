import { env } from "./config/env.js";
import { existsSync } from "node:fs";
import { logger } from "./config/logger.js";
import { ensureSchema } from "./db/schema.js";
import { closePool } from "./db/pool.js";
import { getGraph } from "./graph/index.js";
import { handleInboundTurn } from "./graph/run.js";
import { createServer } from "./api/server.js";
import { getTransport, whatsapp } from "./whatsapp/index.js";
import type { IncomingMessage } from "./whatsapp/index.js";
import { startOutreachScheduler, stopOutreachScheduler } from "./outreach/index.js";
import { closeCal } from "./integrations/calcom.js";

async function main(): Promise<void> {
  logger.info("starting sales automation agent...");

  // 1. Database schema (pgvector, tables, indexes).
  await ensureSchema();

  // 2. Compile the graph (also sets up the LangGraph checkpointer tables).
  await getGraph();

  // 3. HTTP API.
  const app = createServer();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "HTTP API listening");
    logger.info(`  POST /webhook/whatsapp   POST /webhook/leads    POST /simulate`);
    logger.info(`  GET  /health             GET  /leads             GET  /prospects`);
    logger.info(`  GET  /whatsapp/status    POST /whatsapp/connect  GET  /whatsapp/events`);
    logger.info(`  GET  /outreach           POST /outreach/tick     GET  /graph/mermaid`);
  });

  // 4. WhatsApp: register the inbound handler, then start the transport.
  const onIncoming = async (msg: IncomingMessage) => {
    try {
      await handleInboundTurn({
        threadId: `wa:${msg.waJid}`,
        leadId: null,
        waJid: msg.waJid,
        contactName: msg.contactName,
        text: msg.text,
        messageId: msg.messageId,
        receivedAt: new Date(msg.timestamp * 1000).toISOString(),
      });
    } catch (err) {
      logger.error({ err: (err as Error).message }, "turn failed");
    }
  };

  whatsapp.setHandler(onIncoming);
  const transport = getTransport();
  await transport.start(onIncoming);

  // Reconnect the linked WhatsApp session on boot (works even when the
  // outbound transport is `console`, e.g. while testing).
  const hasSession = existsSync(env.WA_AUTH_DIR);
  if (env.WA_AUTO_CONNECT && (env.WA_TRANSPORT === "baileys" || hasSession)) {
    void whatsapp.connect().catch((err) =>
      logger.warn({ err: (err as Error).message }, "auto-connect WhatsApp gagal"),
    );
  }

  logger.info(
    {
      transport: transport.name,
      dryRun: env.DRY_RUN,
      waAutoConnect: env.WA_AUTO_CONNECT,
      waSession: hasSession,
      typing: env.WA_TYPING_ENABLED,
    },
    "transport started",
  );

  // 5. Outbound prospecting scheduler (runs inside working hours only).
  startOutreachScheduler();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down...");
    stopOutreachScheduler();
    await whatsapp.disconnect().catch(() => {});
    await transport.stop().catch(() => {});
    await closeCal().catch(() => {});
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
