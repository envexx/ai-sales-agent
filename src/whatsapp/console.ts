import { randomUUID } from "node:crypto";
import { loggerFor } from "../config/logger.js";
import type { IncomingHandler, Transport } from "./transport.js";

const log = loggerFor("wa:console");

/**
 * Development transport. Prints outgoing messages instead of sending them,
 * so the whole graph can be exercised without linking a WhatsApp account.
 * It never emits inbound messages — drive the graph via `npm run sim` or the
 * `/webhook/whatsapp` HTTP endpoint.
 */
export class ConsoleTransport implements Transport {
  readonly name = "console";

  async start(_onMessage: IncomingHandler): Promise<void> {
    log.info("console transport ready — outgoing messages are logged, not sent");
  }

  async sendText(to: string, text: string): Promise<{ id: string | null }> {
    const id = `console-${randomUUID()}`;
    log.info({ to, id }, `📤 [console] -> ${to}\n${text}`);
    return { id };
  }

  async stop(): Promise<void> {
    /* nothing to clean up */
  }
}
