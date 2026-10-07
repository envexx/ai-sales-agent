import { HumanMessage } from "@langchain/core/messages";
import { loggerFor } from "../config/logger.js";
import { enqueueJob } from "../pipeline/repository.js";
import { emitEvent } from "../pipeline/events.js";
import { getLeadByJid, logConversation, mergeLeadByJid, setOptOut, updateLead, upsertLeadContact } from "../repository/index.js";
import { startsWithGreeting, todayKey } from "../util/time.js";
import type { InboundTurn, LeadRecord } from "../types.js";
import { getGraph } from "./index.js";
import type { SalesStateType } from "./state.js";

const log = loggerFor("graph:run");

/** Deteksi jalur Sales (F0.4): demo video atau meeting langsung. */
function detectEngagementPath(text: string): "demo" | "meeting" | null {
  const t = text.toLowerCase();
  if (/(meeting|meet\b|tatap muka|ketemu|konsultasi|jadwalkan|jadwal pertemuan)/.test(t)) {
    return "meeting";
  }
  if (/(demo|video|contoh|sample|lihat (produk|sistem)|tunjukkan)/.test(t)) {
    return "demo";
  }
  return null;
}

/** Klien yang meminta berhenti — jangan pernah dibalas lagi. */
const OPT_OUT_PATTERN =
  /^(stop|berhenti|unsubscribe|jangan (hubungi|kirim|wa)|tolong jangan|hapus nomor)\b/i;

/**
 * Teks inbound terakhir per lead. Dipakai untuk melewati pesan yang **identik
 * dan berulang** (ciri pesan otomatis/broadcast) tanpa filter kata kunci yang
 * bisa salah membuang pesan manusia.
 */
const lastInboundByLead = new Map<string, string>();

/* ────────────────────────── turn preparation ───────────────────────── */

export interface PreparedTurn {
  lead: LeadRecord;
  contactName: string | null;
  /** true = pesan adalah permintaan berhenti; jangan jalankan agent apa pun. */
  optedOut: boolean;
  /** true = pesan identik berulang dari lead yang sama; lewati (tak dibalas). */
  duplicate: boolean;
}

/**
 * Langkah bersama sebelum agent mana pun menangani satu turn: resolve/ciptakan
 * lead, catat pesan masuk, lalu deteksi opt-out.
 *
 * Dipisah dari eksekusi graph agar supervisor dan pemanggil langsung berbagi
 * langkah yang sama — tanpa pencatatan lead/pesan ganda.
 */
export async function prepareInboundTurn(turn: InboundTurn): Promise<PreparedTurn> {
  // Deteksi apakah percakapan sudah pernah ada (lead sudah dikenal) atau baru.
  const existing = await getLeadByJid(turn.waJid);

  const lead = await upsertLeadContact({
    waJid: turn.waJid,
    name: turn.contactName ?? null,
  });

  // Bila balasan datang via LinkedID (`@lid`), satukan lead `@lid` lama ke lead
  // nomor ini agar percakapan menyatu (pesan pembuka kita + balasan berurutan).
  if (turn.lidJid) {
    await mergeLeadByJid(turn.lidJid, lead.id).catch(() => {});
  }

  // Tandai jenis pesan masuk: percakapan baru (inbound) atau lanjutan (reply).
  await emitEvent(existing ? "lead.inbound_reply" : "lead.inbound_new", {
    entityType: "lead",
    entityId: lead.id,
    payload: { returning: Boolean(existing) },
  }).catch(() => {});

  await logConversation({
    leadId: lead.id,
    threadId: turn.threadId,
    role: "user",
    direction: "inbound",
    content: turn.text,
    meta: { messageId: turn.messageId ?? null },
  });

  const optedOut = OPT_OUT_PATTERN.test(turn.text.trim());
  if (optedOut) {
    await setOptOut(lead.id);
    log.info({ leadId: lead.id, waJid: turn.waJid }, "lead opted out (STOP)");
  }

  // Deteksi pesan identik berulang (ciri broadcast/otomatis) tanpa filter kata kunci.
  const normalized = turn.text.trim().toLowerCase().replace(/\s+/g, " ");
  const previousInbound = lastInboundByLead.get(lead.id);
  const duplicate = !optedOut && normalized.length >= 5 && previousInbound === normalized;
  lastInboundByLead.set(lead.id, normalized);

  return { lead, contactName: turn.contactName ?? lead.name, optedOut, duplicate };
}

/* ────────────────────────── sales worker ───────────────────────────── */

export interface SalesAgentTurn extends InboundTurn {
  leadId: string;
}

/**
 * Channel yang direset tiap turn. Nilai dari turn sebelumnya bocor lewat
 * checkpointer bila tidak direset — paling berbahaya `dispatched`, yang akan
 * membuat node dispatch melewatkan SEMUA balasan setelah balasan pertama.
 */
const TURN_RESET = {
  triage: null,
  isBot: false,
  filtered: false,
  retrievedContext: [],
  leadScore: 0,
  scoreBreakdown: null,
  segment: null,
  strategy: null,
  draftResponse: "",
  finalResponse: "",
  dispatched: false,
  dispatchMessageId: null,
  booking: null,
  availableSlots: [],
  calBooking: null,
  schedulingNote: "",
  evaluation: null,
  reflection: null,
  memoryWritten: false,
  memoryId: null,
  reflectionLoops: 0,
  reenterForImprovement: false,
  trace: [],
  errors: [],
};

/**
 * Menjalankan graph Sales untuk satu turn yang sudah disiapkan. Ini adalah
 * "worker adapter" yang dipanggil supervisor; ia tidak mengurus lead/logging.
 */
export async function runSalesAgent(turn: SalesAgentTurn): Promise<SalesStateType> {
  const graph = await getGraph();
  await emitEvent("sales.started", { entityType: "lead", entityId: turn.leadId });

  const result = (await graph.invoke(
    {
      threadId: turn.threadId,
      leadId: turn.leadId,
      waJid: turn.waJid,
      contactName: turn.contactName ?? null,
      inboundMessage: turn.text,
      receivedAt: turn.receivedAt ?? new Date().toISOString(),
      messageId: turn.messageId ?? null,
      messages: [new HumanMessage(turn.text)],
      ...TURN_RESET,
    },
    {
      configurable: { thread_id: turn.threadId },
      recursionLimit: 50,
    },
  ).catch(async (error: unknown) => {
    await emitEvent("sales.failed", { entityType: "lead", entityId: turn.leadId });
    throw error;
  })) as SalesStateType;

  log.info(
    {
      threadId: turn.threadId,
      segment: result.segment,
      score: result.leadScore,
      filtered: result.filtered,
    },
    "sales turn complete",
  );

  // F0.4: deteksi jalur Sales (demo vs meeting) untuk determinasi Scoper.
  const path = detectEngagementPath(turn.text);
  if (path) {
    await updateLead({
      id: turn.leadId,
      meta: { engagementPath: path, engagementPathAt: new Date().toISOString() },
    }).catch(() => {});
  }

  // Scoper pull: bila booking terkonfirmasi, jadwalkan PRD dengan jalurnya.
  if (result.booking?.status === "confirmed" && turn.leadId) {
    await enqueueJob({
      type: "scoper.prd",
      payload: { leadId: turn.leadId, path: path ?? undefined, dedupeKey: `scoper:${turn.leadId}` },
    }).catch(() => {});
  }

  // Catat tanggal sapaan bila balasan diawali sapaan → agar tidak diulang hari yang sama.
  if (result.finalResponse && startsWithGreeting(result.finalResponse)) {
    await updateLead({ id: turn.leadId, meta: { lastGreetedOn: todayKey() } }).catch(() => {});
  }

  await emitEvent("sales.completed", { entityType: "lead", entityId: turn.leadId, payload: { filtered: result.filtered, dispatched: result.dispatched } });
  return result;
}

/** State minimal untuk turn yang di-opt-out (tidak ada agent yang berjalan). */
function optedOutState(turn: InboundTurn, lead: LeadRecord): SalesStateType {
  return {
    threadId: turn.threadId,
    leadId: lead.id,
    waJid: turn.waJid,
    contactName: turn.contactName ?? lead.name,
    inboundMessage: turn.text,
    receivedAt: turn.receivedAt ?? new Date().toISOString(),
    messageId: turn.messageId ?? null,
    filtered: true,
    isBot: false,
    finalResponse: "",
    trace: [],
    errors: [],
  } as unknown as SalesStateType;
}

/* ────────────────────────── entry point ────────────────────────────── */

/**
 * Entry point langsung (tanpa supervisor): satu pesan masuk → graph Sales.
 *
 * Dipertahankan agar pemanggil lama tetap bekerja. Untuk jalur multi-agent,
 * gunakan `handleSupervisorTurn` di `src/supervisor/run.ts`.
 */
export async function handleInboundTurn(turn: InboundTurn): Promise<SalesStateType> {
  const prepared = await prepareInboundTurn(turn);

  if (prepared.optedOut || prepared.duplicate) {
    return optedOutState(turn, prepared.lead);
  }

  return runSalesAgent({
    ...turn,
    contactName: prepared.contactName,
    leadId: prepared.lead.id,
  });
}
