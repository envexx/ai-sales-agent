import { EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  getContentType,
  useMultiFileAuthState,
  type WASocket,
} from "baileys";
import QRCode from "qrcode";
import { pino } from "pino";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import type { IncomingHandler } from "./transport.js";

const log = loggerFor("wa:service");
const silentLogger = pino({ level: "silent" });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type WaState = "idle" | "connecting" | "qr" | "connected" | "logged_out";

export interface WaStatus {
  state: WaState;
  /** PNG data URL of the current pairing QR (only while state === "qr"). */
  qrDataUrl: string | null;
  me: { id: string; name: string | null } | null;
  lastError: string | null;
  updatedAt: string;
}

type ProtoMessage = { [key: string]: unknown } | null | undefined;

function unwrap(message: ProtoMessage): ProtoMessage {
  if (!message) return message;
  const m = message as Record<string, { message?: ProtoMessage }>;
  return (
    m.ephemeralMessage?.message ??
    m.viewOnceMessage?.message ??
    m.viewOnceMessageV2?.message ??
    message
  );
}

function extractText(raw: ProtoMessage): string {
  const message = unwrap(raw) as Record<string, unknown> | null | undefined;
  if (!message) return "";
  const type = getContentType(message as never);
  switch (type) {
    case "conversation":
      return (message.conversation as string) ?? "";
    case "extendedTextMessage":
      return (message.extendedTextMessage as { text?: string })?.text ?? "";
    case "imageMessage":
      return (message.imageMessage as { caption?: string })?.caption ?? "";
    case "videoMessage":
      return (message.videoMessage as { caption?: string })?.caption ?? "";
    case "buttonsResponseMessage":
      return (
        (message.buttonsResponseMessage as { selectedButtonId?: string })
          ?.selectedButtonId ?? ""
      );
    case "listResponseMessage":
      return (
        (message.listResponseMessage as {
          singleSelectReply?: { selectedRowId?: string };
        })?.singleSelectReply?.selectedRowId ?? ""
      );
    default:
      return "";
  }
}

/**
 * Single owner of the WhatsApp (Baileys) socket.
 *
 * Exposes a small state machine the dashboard can drive over HTTP: connect,
 * read the pairing QR, disconnect, log out. Inbound messages are forwarded to
 * the handler registered by the application at boot.
 */
class WhatsAppService extends EventEmitter {
  private sock: WASocket | null = null;
  private handler: IncomingHandler | null = null;
  private stopping = false;
  private _state: WaState = "idle";
  private _qrDataUrl: string | null = null;
  private _me: { id: string; name: string | null } | null = null;
  private _lastError: string | null = null;
  private _updatedAt = new Date().toISOString();

  setHandler(handler: IncomingHandler): void {
    this.handler = handler;
  }

  status(): WaStatus {
    return {
      state: this._state,
      qrDataUrl: this._qrDataUrl,
      me: this._me,
      lastError: this._lastError,
      updatedAt: this._updatedAt,
    };
  }

  private setState(state: WaState, patch: Partial<WaStatus> = {}): void {
    this._state = state;
    if (patch.qrDataUrl !== undefined) this._qrDataUrl = patch.qrDataUrl;
    if (patch.me !== undefined) this._me = patch.me;
    if (patch.lastError !== undefined) this._lastError = patch.lastError;
    this._updatedAt = new Date().toISOString();
    this.emit("status", this.status());
  }

  /** Start (or restart) the socket and begin emitting a QR when needed. */
  async connect(): Promise<WaStatus> {
    if (this._state === "connected" || this._state === "connecting") {
      return this.status();
    }
    this.stopping = false;
    this.setState("connecting", { qrDataUrl: null, lastError: null });
    await this.openSocket();
    return this.status();
  }

  async disconnect(): Promise<WaStatus> {
    this.stopping = true;
    try {
      this.sock?.end(undefined);
    } catch {
      /* ignore */
    }
    this.sock = null;
    this.setState("idle", { qrDataUrl: null, me: null });
    return this.status();
  }

  /** Disconnect and delete the stored credentials (next connect shows a QR). */
  async logout(): Promise<WaStatus> {
    await this.disconnect();
    await rm(env.WA_AUTH_DIR, { recursive: true, force: true }).catch(() => {});
    this.setState("logged_out", { qrDataUrl: null, me: null });
    log.info("WhatsApp session removed");
    return this.status();
  }

  async sendText(to: string, text: string): Promise<{ id: string | null }> {
    if (!this.sock || this._state !== "connected") {
      throw new Error("WhatsApp belum terhubung");
    }

    // Human-like behaviour: show "sedang menulis…" for a duration proportional
    // to the message length (with jitter) before the bubble actually lands.
    if (env.WA_TYPING_ENABLED) {
      try {
        await this.sock.presenceSubscribe(to);
        await this.sock.sendPresenceUpdate("composing", to);
        await delay(this.typingDuration(text));
      } catch {
        /* presence is best-effort */
      }
    }

    const sent = await this.sock.sendMessage(to, { text });

    if (env.WA_TYPING_ENABLED) {
      try {
        await this.sock.sendPresenceUpdate("paused", to);
      } catch {
        /* ignore */
      }
    }

    return { id: sent?.key?.id ?? null };
  }

  /** Milliseconds to "type" a message, clamped and jittered. */
  private typingDuration(text: string): number {
    const base = (text.length / Math.max(1, env.WA_TYPING_CPS)) * 1000;
    const jittered = base * (0.85 + Math.random() * 0.3);
    return Math.round(
      Math.min(env.WA_TYPING_MAX_MS, Math.max(env.WA_TYPING_MIN_MS, jittered)),
    );
  }

  private async openSocket(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(env.WA_AUTH_DIR);
    let version: [number, number, number] | undefined;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      log.warn("could not fetch latest Baileys version, using default");
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger: silentLogger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          this._qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        } catch {
          this._qrDataUrl = null;
        }
        this.setState("qr", { qrDataUrl: this._qrDataUrl });
        log.info("QR pairing code generated — scan it in the dashboard");
      }

      if (connection === "open") {
        const me = sock.user;
        this.setState("connected", {
          qrDataUrl: null,
          me: me ? { id: me.id, name: me.name ?? null } : null,
          lastError: null,
        });
        log.info({ id: me?.id, name: me?.name }, "WhatsApp connected");
        return;
      }

      if (connection === "close") {
        const statusCode = (
          lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
        )?.output?.statusCode;

        if (this.stopping) return;

        if (statusCode === DisconnectReason.loggedOut) {
          await rm(env.WA_AUTH_DIR, { recursive: true, force: true }).catch(() => {});
          this.setState("logged_out", { qrDataUrl: null, me: null });
          log.error("WhatsApp logged out");
          return;
        }

        this.setState("connecting", {
          lastError: `koneksi terputus (code ${statusCode ?? "?"}), mencoba lagi`,
        });
        log.warn({ statusCode }, "connection closed, reconnecting in 3s...");
        setTimeout(() => {
          void this.openSocket().catch((e) => log.error(e));
        }, 3000);
      }
    });

    sock.ev.on("messages.upsert", async (event) => {
      if (event.type !== "notify") return;
      for (const msg of event.messages) {
        try {
          if (!msg.message) continue;
          if (msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid) continue;
          if (remoteJid === "status@broadcast") continue;
          if (remoteJid.endsWith("@g.us")) continue;

          const text = extractText(msg.message as ProtoMessage).trim();
          if (!text) continue;

          if (env.WA_READ_RECEIPTS) {
            try {
              await sock.readMessages([msg.key]);
            } catch {
              /* ignore */
            }
          }

          await this.handler?.({
            waJid: remoteJid,
            contactName: msg.pushName ?? null,
            text,
            messageId: msg.key.id ?? null,
            timestamp: Number(msg.messageTimestamp ?? Date.now() / 1000),
          });
        } catch (err) {
          log.error({ err: (err as Error).message }, "failed to handle incoming message");
        }
      }
    });
  }
}

export const whatsapp = new WhatsAppService();
