import { env } from "../config/env.js";
import { ConsoleTransport } from "./console.js";
import { whatsapp } from "./service.js";
import type { Transport } from "./transport.js";

export { whatsapp } from "./service.js";
export type { WaState, WaStatus } from "./service.js";

let instance: Transport | null = null;

/**
 * Outbound transport backed by the shared WhatsApp service. The service is
 * driven from the dashboard (Settings → WhatsApp); this adapter only routes
 * dispatch through it.
 */
const serviceTransport: Transport = {
  name: "baileys",
  async start() {
    if (env.WA_AUTO_CONNECT) await whatsapp.connect();
  },
  async sendText(to: string, text: string) {
    return whatsapp.sendText(to, text);
  },
  async stop() {
    await whatsapp.disconnect();
  },
};

export function getTransport(): Transport {
  if (instance) return instance;
  instance = env.WA_TRANSPORT === "baileys" ? serviceTransport : new ConsoleTransport();
  return instance;
}

export type { Transport, IncomingMessage, IncomingHandler } from "./transport.js";
export { normalizeJid } from "./transport.js";
