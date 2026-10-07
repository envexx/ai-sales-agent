import { env } from "../config/env.js";

export interface IncomingMessage {
  /** WhatsApp JID, e.g. `6281234567890@s.whatsapp.net`. */
  waJid: string;
  /**
   * JID `@lid` asli bila berbeda dari `waJid` (balasan lewat LinkedID). Dipakai
   * untuk menyatukan balasan client ke lead nomor yang sama.
   */
  lidJid?: string | null;
  contactName: string | null;
  text: string;
  messageId: string | null;
  timestamp: number;
}

export type IncomingHandler = (msg: IncomingMessage) => Promise<void>;

export interface Transport {
  readonly name: string;
  /** Begin receiving messages. */
  start(onMessage: IncomingHandler): Promise<void>;
  /** Send a text message to a JID (or phone number). */
  sendText(to: string, text: string): Promise<{ id: string | null }>;
  /** Gracefully disconnect. */
  stop(): Promise<void>;
}

/** Normalise a phone number or JID into a WhatsApp individual JID. */
export function normalizeJid(input: string, countryCode?: string): string {
  if (input.includes("@")) return input;
  const cc =
    (countryCode ?? env.WA_DEFAULT_COUNTRY_CODE).replace(/\D/g, "") || "62";
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `${cc}${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `${cc}${digits}`;
  return `${digits}@s.whatsapp.net`;
}
