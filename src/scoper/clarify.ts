import { loggerFor } from "../config/logger.js";
import { textInvoke } from "../llm/index.js";
import { emitEvent } from "../pipeline/events.js";
import { getLeadById, updateLead } from "../repository/index.js";
import type { JobRecord, JobResult } from "../pipeline/types.js";
import { sendOutbound } from "../whatsapp/outbound.js";

const log = loggerFor("scoper:clarify");

/**
 * Loop pertanyaan terbuka: Scoper menyerahkan pertanyaan yang belum jelas ke
 * **Sales**, lalu Sales menanyakannya ke klien dengan bahasa sales/customer
 * support. Balasan klien akan memicu Scoper memperbarui PRD.
 */
export async function askClarification(job: JobRecord): Promise<JobResult> {
  const p = job.payload as { projectId?: string; leadId?: string; questions?: string[] };
  if (!p.leadId || !p.questions?.length) return { ok: false, note: "leadId & questions wajib" };

  const lead = await getLeadById(p.leadId);
  if (!lead) return { ok: false, note: "lead tidak ditemukan" };

  const questions = p.questions.slice(0, 8);
  const human = [
    `Nama klien/bisnis: ${lead.company ?? lead.name ?? "klien"}`,
    "Hal yang masih perlu dipastikan sebelum menyusun spesifikasi:",
    ...questions.map((q) => `- ${q}`),
    "Tulis SATU pesan WhatsApp singkat, ramah, sopan (seperti customer support/sales). Gabungkan pertanyaan secara natural dan berurutan, tanpa istilah teknis berat, akhiri dengan ajakan singkat. Jangan menyebut 'PRD' atau 'dokumen'.",
  ].join("\n");

  let message: string;
  try {
    message = await textInvoke({
      system:
        "Kamu Nadia, perwakilan sales yang ramah dari perusahaan solusi digital/AI. Tulis pesan WhatsApp natural, ringkas, sopan, dalam Bahasa Indonesia (maksimal ~80 kata).",
      human,
      temperature: 0.5,
      maxTokens: 320,
      name: "SalesClarify",
      provider: "openrouter",
    });
  } catch (err) {
    log.warn({ err: (err as Error).message }, "clarify compose gagal, pakai template");
    message = `Halo ${lead.name ?? "Bapak/Ibu"} 🙏 Boleh dibantu beberapa info agar kami bisa siapkan solusi yang paling tepat: ${questions.join("; ")}. Terima kasih!`;
  }
  message = message.trim();

  await sendOutbound({
    waJid: lead.waJid,
    text: message,
    leadId: lead.id,
    threadId: `wa:${lead.waJid}`,
  }).catch(() => {});

  await updateLead({
    id: lead.id,
    meta: {
      pendingClarify: {
        projectId: p.projectId ?? null,
        questions,
        at: new Date().toISOString(),
      },
    },
  }).catch(() => {});

  await emitEvent("prd.clarify_requested", {
    entityType: "lead",
    entityId: lead.id,
    payload: { projectId: p.projectId ?? null, count: questions.length },
  });

  return { ok: true, note: `klarifikasi dikirim (${questions.length})`, data: { leadId: lead.id } };
}
