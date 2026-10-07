import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { structuredInvoke } from "../llm/index.js";
import { notifyOwner } from "../notifications/index.js";
import { createTicket } from "../pipeline/entities.js";
import { emitEvent } from "../pipeline/events.js";
import { loadSopContext } from "./sopContext.js";

const log = loggerFor("support");

const TriageSchema = z.object({
  category: z.enum(["human_error", "system_failure", "question", "other"]),
  severity: z.enum(["l1", "l2", "emergency"]),
  subject: z.string(),
  reply: z.string(),
  escalate: z.boolean(),
  reason: z.string(),
});

export interface SupportResult {
  ticketId: string;
  category: string;
  severity: string;
  escalated: boolean;
  reply: string;
}

/**
 * L1 Support & Triage (F4).
 *
 * Menangani kendala pertama dari klien: membedakan human error vs kegagalan
 * sistem, menjawab solusi instan, dan mengeskalasi ke owner hanya bila perlu
 * (kode/sistem mati total). Setiap laporan dicatat sebagai tiket.
 */
export async function runSupport(params: {
  message: string;
  channel?: string;
  clientId?: string | null;
  projectId?: string | null;
  leadId?: string | null;
  contactName?: string | null;
}): Promise<SupportResult> {
  if (!env.SUPPORT_ENABLED) throw new Error("Support nonaktif (SUPPORT_ENABLED=false)");

  // Jawaban dikunci ke SOP/panduan proyek klien (bila tersedia).
  const sop = params.projectId
    ? await loadSopContext(params.projectId, params.message)
    : "";

  const triage = await structuredInvoke({
    schema: TriageSchema,
    system:
      "Kamu L1 support untuk sistem otomasi klien. Klasifikasikan keluhan: 'human_error' (salah input/format), " +
      "'system_failure' (sistem mati/error kode), 'question' (pertanyaan umum), atau 'other'. " +
      "Jawab berdasarkan SOP/panduan proyek yang diberikan bila ada; jangan mengarang langkah di luar itu. " +
      "Bila SOP tidak memuat jawabannya, katakan akan diteruskan ke tim. " +
      "Naikkan 'escalate' hanya untuk kegagalan sistem/kode atau darurat.",
    human: [
      sop ? `SOP/panduan proyek:\n"""${sop}"""` : "SOP proyek: (tidak tersedia)",
      `Pesan klien:\n"""${params.message}"""`,
    ].join("\n\n"),
    name: "SupportTriage",
    temperature: 0,
  });

  const ticketId = await createTicket({
    clientId: params.clientId ?? null,
    projectId: params.projectId ?? null,
    channel: params.channel ?? "whatsapp",
    severity: triage.severity,
    status: triage.escalate ? "escalated" : "open",
    subject: triage.subject,
    body: params.message,
    resolution: triage.escalate ? null : triage.reply,
  });

  await emitEvent("support.ticket", {
    entityType: "ticket",
    entityId: ticketId,
    payload: { category: triage.category, severity: triage.severity, escalate: triage.escalate },
  });

  if (triage.escalate) {
    await notifyOwner({
      title: `🚨 Eskalasi support (${triage.severity}): ${triage.subject}`,
      body: `${triage.reason}\n\nPesan: ${params.message}`,
    });
    await emitEvent("support.escalated", {
      entityType: "ticket",
      entityId: ticketId,
      payload: { reason: triage.reason },
    });
  }

  log.info({ ticketId, category: triage.category, escalate: triage.escalate }, "support triage");
  return {
    ticketId,
    category: triage.category,
    severity: triage.severity,
    escalated: triage.escalate,
    reply: triage.reply,
  };
}
