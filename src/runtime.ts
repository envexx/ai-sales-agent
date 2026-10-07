import { existsSync } from "node:fs";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { ensureSchema } from "./db/schema.js";
import { getGraph } from "./graph/index.js";
import { getSupervisorGraph } from "./supervisor/index.js";
import { getResearchGraph } from "./research/index.js";
import { handleSupervisorTurn } from "./supervisor/run.js";
import { getTransport, whatsapp } from "./whatsapp/index.js";
import type { IncomingMessage } from "./whatsapp/index.js";
import { startOutreachScheduler, stopOutreachScheduler } from "./outreach/index.js";
import { startPipelineScheduler, stopPipelineScheduler } from "./pipeline/scheduler.js";
import { startTelegramBot, stopTelegramBot } from "./support/telegramBot.js";
import { startDeveloperTelegramBot, stopDeveloperTelegramBot } from "./developer/telegram.js";
import { closeCal } from "./integrations/calcom.js";

/**
 * Boot runtime aplikasi (tanpa HTTP server): schema, graph, transport WhatsApp,
 * outreach + pipeline scheduler, dan bot Telegram.
 *
 * Dipakai bersama oleh entry produksi `src/index.ts` dan dev-helper UI
 * (`.playwright-cli/ui-api.ts`) agar keduanya menjalankan aplikasi yang lengkap —
 * khususnya **pipeline scheduler** yang memproses job agent (mis. `scout.audit`).
 */
export async function startRuntime(): Promise<void> {
  // 1. Database schema (pgvector, tables, indexes).
  await ensureSchema();

  // 2. Compile the graphs (also sets up the LangGraph checkpointer tables).
  await getGraph();
  getSupervisorGraph();
  await getResearchGraph();

  // 3. WhatsApp: register the inbound handler, then start the transport.
  const onIncoming = async (msg: IncomingMessage) => {
    try {
      await handleSupervisorTurn({
        threadId: `wa:${msg.waJid}`,
        leadId: null,
        waJid: msg.waJid,
        lidJid: msg.lidJid ?? null,
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

  // 4. Outbound prospecting scheduler (runs inside working hours only).
  startOutreachScheduler();

  // 5. Business pipeline scheduler (jobs: briefing, scout.audit, dst.).
  startPipelineScheduler();

  // 6. L1 Support: bot Telegram untuk kanal klien (bila token diisi).
  startTelegramBot();

  // 7. Developer: bot Telegram khusus approval eksekusi (bila token diisi).
  startDeveloperTelegramBot();
}

/** Hentikan semua komponen runtime (untuk shutdown yang rapi). */
export async function stopRuntime(): Promise<void> {
  stopOutreachScheduler();
  stopPipelineScheduler();
  stopTelegramBot();
  stopDeveloperTelegramBot();
  await whatsapp.disconnect().catch(() => {});
  await getTransport().stop().catch(() => {});
  await closeCal().catch(() => {});
}
