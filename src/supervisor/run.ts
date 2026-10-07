import { loggerFor } from "../config/logger.js";
import { prepareInboundTurn } from "../graph/run.js";
import { isOwner } from "../notifications/index.js";
import { enqueueJob } from "../pipeline/repository.js";
import { handleOwnerCommand } from "../pipeline/commands.js";
import { findProjectIdForLead } from "../pipeline/entities.js";
import { markLeadInSales } from "../pipeline/lifecycle.js";
import { updateLead } from "../repository/index.js";
import { runSupport } from "../support/run.js";
import { sendOutbound } from "../whatsapp/outbound.js";
import type { InboundTurn } from "../types.js";
import { adviseSupervisor } from "./advisor.js";
import { salesAgentNode } from "./nodes/sales.js";
import type { SupervisorStateType } from "./state.js";

const log = loggerFor("supervisor:run");

/** Pesan yang mengindikasikan kendala dukungan (kandidat L1). */
const SUPPORT_PATTERN =
  /(kendala|komplain|keluhan|error|tidak bisa|tidak masuk|gagal|rusak|macet|bug|tidak jalan|mati total|tidak berfungsi)/i;

function isSupportMessage(text: string): boolean {
  return SUPPORT_PATTERN.test(text);
}

/**
 * Channel yang direset tiap turn.
 */
const TURN_RESET = {
  activeAgent: null,
  routeReason: "",
  routeConfidence: 0,
  agentResult: null,
  reply: "",
  filtered: false,
  trace: [],
  errors: [],
};

/** Lead siap dikerjakan Sales. */
const SALES_READY = new Set(["scouted_ready", "in_sales", "won"]);

/**
 * Entry point satu turn masuk.
 *
 * **F0.2/F0.4:** Supervisor bukan router. Chat masuk **langsung ke Sales**.
 * Supervisor hanya menangani perintah owner (approval/briefing) dan pemantauan.
 * Gate: prospek hanya diproses bila sudah `scouted_ready` (Scout selesai).
 */
export async function handleSupervisorTurn(
  turn: InboundTurn,
): Promise<SupervisorStateType> {
  const prepared = await prepareInboundTurn(turn);

  // Opt-out: tidak ada agent yang dijalankan dan tidak ada balasan.
  if (prepared.optedOut) {
    return {
      threadId: turn.threadId,
      leadId: prepared.lead.id,
      waJid: turn.waJid,
      contactName: prepared.contactName,
      inboundMessage: turn.text,
      receivedAt: turn.receivedAt ?? new Date().toISOString(),
      messageId: turn.messageId ?? null,
      ...TURN_RESET,
      filtered: true,
    } as unknown as SupervisorStateType;
  }

  // Pesan identik berulang (ciri broadcast/otomatis) → dilewati tanpa balasan.
  if (prepared.duplicate) {
    log.info(
      { threadId: turn.threadId, leadId: prepared.lead.id },
      "pesan berulang identik → dilewati",
    );
    return {
      threadId: turn.threadId,
      leadId: prepared.lead.id,
      waJid: turn.waJid,
      contactName: prepared.contactName,
      inboundMessage: turn.text,
      receivedAt: turn.receivedAt ?? new Date().toISOString(),
      messageId: turn.messageId ?? null,
      ...TURN_RESET,
      filtered: true,
    } as unknown as SupervisorStateType;
  }

  // Perintah owner (approval/briefing/status) ditangani lebih dulu.
  if (isOwner(turn.waJid)) {
    const command = await handleOwnerCommand(turn.text);
    if (command.handled) {
      await sendOutbound({
        waJid: turn.waJid,
        text: command.reply,
        leadId: prepared.lead.id,
        threadId: turn.threadId,
      });
      log.info({ threadId: turn.threadId }, "owner command handled");
      return {
        threadId: turn.threadId,
        leadId: prepared.lead.id,
        waJid: turn.waJid,
        contactName: prepared.contactName,
        inboundMessage: turn.text,
        receivedAt: turn.receivedAt ?? new Date().toISOString(),
        messageId: turn.messageId ?? null,
        ...TURN_RESET,
        reply: command.reply,
      } as unknown as SupervisorStateType;
    }

    // Bukan perintah → obrolan dengan Supervisor sebagai penasihat strategis.
    try {
      const reply = await adviseSupervisor(turn.text);
      await sendOutbound({
        waJid: turn.waJid,
        text: reply,
        leadId: prepared.lead.id,
        threadId: turn.threadId,
      });
      log.info({ threadId: turn.threadId }, "owner chat → supervisor advisor");
      return {
        threadId: turn.threadId,
        leadId: prepared.lead.id,
        waJid: turn.waJid,
        contactName: prepared.contactName,
        inboundMessage: turn.text,
        receivedAt: turn.receivedAt ?? new Date().toISOString(),
        messageId: turn.messageId ?? null,
        ...TURN_RESET,
        activeAgent: "supervisor",
        routeReason: "chat owner → Supervisor (penasihat)",
        reply,
      } as unknown as SupervisorStateType;
    } catch (err) {
      log.error({ err: (err as Error).message }, "advisor gagal, lanjut alur biasa");
    }
  }

  const base = {
    threadId: turn.threadId,
    leadId: prepared.lead.id,
    waJid: turn.waJid,
    contactName: prepared.contactName,
    inboundMessage: turn.text,
    receivedAt: turn.receivedAt ?? new Date().toISOString(),
    messageId: turn.messageId ?? null,
    ...TURN_RESET,
  };

  // F0.7: klien yang sudah punya proyek + pesan kendala → L1 menjawab,
  // Sales yang meneruskan balasannya ke klien.
  const projectId = await findProjectIdForLead(prepared.lead.id);
  if (projectId && isSupportMessage(turn.text)) {
    try {
      const result = await runSupport({
        message: turn.text,
        channel: "sales-relay",
        projectId,
        leadId: prepared.lead.id,
      });
      await sendOutbound({
        waJid: turn.waJid,
        text: result.reply,
        leadId: prepared.lead.id,
        threadId: turn.threadId,
      });
      log.info({ ticketId: result.ticketId, escalated: result.escalated }, "L1 relay via Sales");
      return {
        ...base,
        reply: result.reply,
        agentResult: {
          agent: "sales",
          reply: result.reply,
          metadata: { via: "L1", ticketId: result.ticketId, escalated: result.escalated },
        },
      } as unknown as SupervisorStateType;
    } catch (err) {
      log.error({ err: (err as Error).message }, "L1 relay gagal, lanjut ke Sales");
    }
  }

  // Gate F0.4: prospek hanya diproses bila Scout sudah menyelesaikan auditnya.
  if (prepared.lead.kind === "prospect" && !SALES_READY.has(prepared.lead.readiness)) {
    log.info(
      { leadId: prepared.lead.id, readiness: prepared.lead.readiness },
      "prospect belum siap → Sales menunggu Scout",
    );
    return { ...base, filtered: true } as unknown as SupervisorStateType;
  }

  // Tandai prospek masuk tahap Sales.
  if (prepared.lead.kind === "prospect" && prepared.lead.readiness === "scouted_ready") {
    await markLeadInSales(prepared.lead.id);
  }

  // Chat biasa → Sales menangani langsung (tanpa delegasi supervisor).
  const update = await salesAgentNode(base as unknown as SupervisorStateType);

  // Loop pertanyaan terbuka: bila lead sedang menunggu klarifikasi PRD,
  // perbarui PRD setelah klien menjawab.
  const pending = (prepared.lead.meta as { pendingClarify?: { projectId?: string } } | undefined)
    ?.pendingClarify;
  if (pending?.projectId) {
    await enqueueJob({
      type: "scoper.prd",
      payload: { leadId: prepared.lead.id, projectId: pending.projectId },
    }).catch(() => {});
    await updateLead({ id: prepared.lead.id, meta: { pendingClarify: null } }).catch(() => {});
    log.info(
      { leadId: prepared.lead.id, projectId: pending.projectId },
      "klarifikasi dijawab → perbarui PRD",
    );
  }

  return {
    ...base,
    activeAgent: "sales",
    routeReason: "chat → Sales (langsung)",
    routeConfidence: 1,
    ...update,
  } as unknown as SupervisorStateType;
}
