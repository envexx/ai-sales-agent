import { EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getContentType,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "baileys";
import QRCode from "qrcode";
import { pino } from "pino";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { describeImage } from "../integrations/vision.js";
import { transcribeAudio } from "../integrations/whisper.js";
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
 * Tentukan teks yang diproses pipeline dari satu pesan. Bila pesan berupa
 * media, unduh lalu ubah jadi teks: voice note → transkrip Whisper,
 * gambar → deskripsi DeepSeek vision. Hanya dijalankan saat dibutuhkan.
 */
async function resolveIncomingText(sock: WASocket, msg: WAMessage): Promise<string> {
  const text = extractText(msg.message as ProtoMessage).trim();
  if (text) return text;
  if (!env.MEDIA_ENABLED) return "";

  const raw = unwrap(msg.message as ProtoMessage) as Record<string, unknown> | null | undefined;
  const type = raw ? getContentType(raw as never) : undefined;

  try {
    if (type === "audioMessage") {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, {
        logger: silentLogger,
        reuploadRequest: sock.updateMediaMessage,
      });
      const transcript = await transcribeAudio(Buffer.from(buffer), "ogg");
      return transcript ? `[Voice note] ${transcript}` : "";
    }
    if (type === "imageMessage") {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, {
        logger: silentLogger,
        reuploadRequest: sock.updateMediaMessage,
      });
      const mime =
        (raw?.imageMessage as { mimetype?: string } | undefined)?.mimetype ?? "image/jpeg";
      const desc = await describeImage(Buffer.from(buffer), mime);
      return desc ? `[Gambar] ${desc}` : "";
    }
  } catch (err) {
    log.warn({ err: (err as Error).message }, "gagal memproses media masuk");
  }
  return "";
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
  /** Penanda pesan yang sudah diproses (cegah balasan dobel). */
  private processedIds = new Set<string>();
  private processedOrder: string[] = [];
  /** Antrean per-kontak: proses pesan satu per satu agar tidak balapan. */
  private threadChains = new Map<string, Promise<void>>();

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

  /** Catat id pesan yang sudah diproses (dengan batas memori). */
  private rememberProcessed(id: string): void {
    this.processedIds.add(id);
    this.processedOrder.push(id);
    if (this.processedOrder.length > 5000) {
      const oldest = this.processedOrder.shift();
      if (oldest) this.processedIds.delete(oldest);
    }
  }

  /** Tunggu sampai socket siap (mis. sedang reconnect) sebelum menyerah. */
  private async waitUntilConnected(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this._state !== "connected" || !this.sock) {
      if (this._state === "logged_out") throw new Error("WhatsApp sudah logout");
      if (Date.now() > deadline) throw new Error("WhatsApp belum terhubung");
      await delay(500);
    }
  }

  async sendText(to: string, text: string): Promise<{ id: string | null }> {
    // Jangan langsung gagal bila sedang reconnect — tunggu koneksi sebentar.
    await this.waitUntilConnected(env.WA_SEND_CONNECT_TIMEOUT_MS);
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

          const msgId = msg.key.id ?? null;
          // Cegah balasan dobel: abaikan pesan yang sudah pernah diproses.
          if (msgId && this.processedIds.has(msgId)) {
            log.debug({ msgId }, "pesan duplikat dilewati");
            continue;
          }
          if (msgId) this.rememberProcessed(msgId);

          if (env.WA_READ_RECEIPTS) {
            try {
              await sock.readMessages([msg.key]);
            } catch {
              /* ignore */
            }
          }

          // Identitas lead: bila balasan datang via LinkedID (`@lid`) tetapi ada
          // nomor telepon (`senderPn`), pakai nomor itu agar menyatu dengan lead
          // tempat kita meng-outreach. `lidJid` disimpan untuk merge data lama.
          const pn =
            typeof msg.key.senderPn === "string" && msg.key.senderPn.endsWith("@s.whatsapp.net")
              ? msg.key.senderPn
              : null;
          const identityJid = pn ?? remoteJid;
          const lidJid = identityJid !== remoteJid ? remoteJid : null;

          // Antre per-kontak: proses berurutan agar tidak balapan / dobel.
          // Teks ditentukan di dalam antrean (voice note/gambar diunduh & diubah).
          const previous = this.threadChains.get(identityJid) ?? Promise.resolve();
          const next = previous
            .catch(() => {})
            .then(async () => {
              const text = await resolveIncomingText(sock, msg);
              if (!text) return;
              await this.handler?.({
                waJid: identityJid,
                lidJid,
                contactName: msg.pushName ?? null,
                text,
                messageId: msgId,
                timestamp: Number(msg.messageTimestamp ?? Date.now() / 1000),
              });
            })
            .catch((err) => {
              log.error({ err: (err as Error).message }, "failed to handle incoming message");
            })
            .finally(() => {
              if (this.threadChains.get(identityJid) === next) this.threadChains.delete(identityJid);
            });
          this.threadChains.set(identityJid, next);
        } catch (err) {
          log.error({ err: (err as Error).message }, "failed to handle incoming message");
        }
      }
    });
  }
}

export const whatsapp = new WhatsAppService();
