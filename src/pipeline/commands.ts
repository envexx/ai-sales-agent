import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { notifyOwner } from "../notifications/index.js";
import { decideByPrefix, shortId } from "./approvals.js";
import {
  buildBriefingSnapshot,
  formatBriefing,
  scheduleNextBriefing,
} from "./handlers/briefing.js";
import { processDueJobs } from "./jobs.js";
import { enqueueJob, listApprovals } from "./repository.js";
import { runScoper } from "../scoper/run.js";
import { markProjectInvoicePaid, runLegal } from "../legal/run.js";
import { markSystemBuilt } from "./flow.js";
import { markLeadInSales } from "./lifecycle.js";
import { linkChannel, listChannels } from "./entities.js";

const log = loggerFor("pipeline:commands");

export interface CommandResult {
  handled: boolean;
  reply: string;
}

const HELP = [
  "Perintah owner:",
  "• BRIEFING — kirim ringkasan sekarang",
  "• STATUS — lihat ringkasan pipeline",
  "• PENDING — daftar approval tertunda",
  "• APPROVE <id> [catatan]",
  "• REJECT <id> [catatan]",
  "• PRD <leadId> — buat PRD proyek dari transkrip klien",
  "• LEGAL <projectId> [dp] — buat draf SPK/NDA + invoice DP",
  "• DP PAID <projectId> — catat DP lunas",
  "• BUILT <projectId> [webhookUrl] — tandai sistem selesai → jalankan QA",
  "• MAINTAIN <projectId> — audit situs/repo & rencanakan perbaikan Developer",
  "• DEV <deskripsi> — rencanakan otomasi / AI agent baru",
  "• QUALIFY <leadId> [demo|meeting] — mulai Scoper untuk lead",
  "• LINK <chatId> <projectId> — hubungkan kanal Telegram ke proyek",
  "• CHANNELS — daftar kanal klien",
  "• TICK — proses job terjadwal sekarang",
].join("\n");

/**
 * Tangani perintah dari owner lewat WhatsApp (mis. approval, briefing).
 *
 * Hanya dipanggil untuk pengirim yang sudah dikonfirmasi owner.
 */
export async function handleOwnerCommand(text: string): Promise<CommandResult> {
  const raw = text.trim();
  const prefix = env.APPROVAL_PREFIX.trim().toUpperCase();
  const lead = prefix ? `(?:${prefix}\\s+)?` : "";

  const approve = raw.match(new RegExp(`^${lead}(approve|acc|setuju)\\s+([A-Za-z0-9-]+)\\s*(.*)$`, "i"));
  const reject = raw.match(new RegExp(`^${lead}(reject|tolak)\\s+([A-Za-z0-9-]+)\\s*(.*)$`, "i"));

  if (approve || reject) {
    const match = (approve ?? reject)!;
    const decision = approve ? "approved" : "rejected";
    const id = match[2]!;
    const note = match[3]?.trim() || undefined;
    const updated = await decideByPrefix(id, decision, "owner", note);
    log.info({ decision, id }, "owner memutuskan approval");
    return {
      handled: true,
      reply: updated
        ? `${decision === "approved" ? "✅ Disetujui" : "❌ Ditolak"}: ${updated.title} (${shortId(updated.id)})`
        : `Approval ${id} tidak ditemukan atau sudah diputuskan.`,
    };
  }

  const command = raw.toLowerCase();

  const legalMatch = raw.match(/^legal\s+([A-Za-z0-9-]{6,})(?:\s+(\d{3,}))?$/i);
  if (legalMatch) {
    const projectId = legalMatch[1]!;
    const amount = legalMatch[2] ? Number(legalMatch[2]) : undefined;
    try {
      const result = await runLegal({ projectId, amount });
      return {
        handled: true,
        reply:
          `📄 Draf legal dibuat (SPK + NDA + invoice DP).\n` +
          `Invoice DP: Rp ${result.amount.toLocaleString("id-ID")}\n` +
          `Dokumen: ${result.workspace}\\legal`,
      };
    } catch (err) {
      return { handled: true, reply: `Gagal membuat legal: ${(err as Error).message}` };
    }
  }

  const paidMatch = raw.match(/^dp\s+paid\s+([A-Za-z0-9-]{6,})$/i);
  if (paidMatch) {
    const paid = await markProjectInvoicePaid(paidMatch[1]!);
    return {
      handled: true,
      reply: paid
        ? `✅ DP lunas dicatat (Rp ${paid.amount.toLocaleString("id-ID")}). Proyek siap Intake & Credential.`
        : "Tidak ada invoice DP yang menunggu untuk proyek itu.",
    };
  }

  const builtMatch = raw.match(/^(?:built|build\s+done|selesai\s+bangun)\s+([A-Za-z0-9-]{6,})\s*(\S+)?$/i);
  if (builtMatch) {
    const jobId = await markSystemBuilt({
      projectId: builtMatch[1]!,
      webhookUrl: builtMatch[2]?.startsWith("http") ? builtMatch[2] : undefined,
    });
    return {
      handled: true,
      reply: `🛠️ Proyek ditandai "built". QA ${jobId ? "dijadwalkan" : "sudah dalam antrean"}.`,
    };
  }

  const maintainMatch = raw.match(/^maintain\s+([A-Za-z0-9-]{6,})$/i);
  if (maintainMatch) {
    const projectId = maintainMatch[1]!;
    const jobId = await enqueueJob({ type: "developer.maintain", payload: { projectId } });
    return {
      handled: true,
      reply: `🧑‍💻 Developer dijadwalkan mengaudit proyek ${projectId.slice(0, 8)}${jobId ? "" : " (sudah antre)"}. Setujui rencana setelah siap.`,
    };
  }

  const devMatch = raw.match(/^dev\s+(.+)$/i);
  if (devMatch) {
    const brief = devMatch[1]!.trim();
    const title = brief.length > 60 ? `${brief.slice(0, 57)}...` : brief;
    const jobId = await enqueueJob({ type: "developer.build", payload: { title, brief } });
    return {
      handled: true,
      reply: `🧑‍💻 Developer menyusun rencana build${jobId ? "" : " (sudah antre)"}. Anda akan diminta menyetujui sebelum kode ditulis.`,
    };
  }

  const qualifyMatch = raw.match(/^qualify\s+([A-Za-z0-9-]{6,})\s*(demo|meeting)?$/i);
  if (qualifyMatch) {
    const leadId = qualifyMatch[1]!;
    const path = qualifyMatch[2]?.toLowerCase() as "demo" | "meeting" | undefined;
    await markLeadInSales(leadId);
    const jobId = await enqueueJob({ type: "scoper.prd", payload: { leadId, path } });
    return {
      handled: true,
      reply: `📄 Scoper dijadwalkan untuk lead ${leadId.slice(0, 8)}${path ? ` (jalur ${path})` : ""}.`,
    };
  }

  const linkMatch = raw.match(/^link\s+(-?\d+)\s+([A-Za-z0-9-]{6,})$/i);
  if (linkMatch) {
    const id = await linkChannel({
      channel: "telegram",
      externalId: linkMatch[1]!,
      projectId: linkMatch[2]!,
    });
    return { handled: true, reply: `🔗 Kanal Telegram ${linkMatch[1]} terhubung ke proyek ${linkMatch[2]!.slice(0, 8)}.` };
  }

  if (/^(channels|kanal)\b/.test(command)) {
    const channels = await listChannels(50);
    if (channels.length === 0) return { handled: true, reply: "Belum ada kanal klien terhubung." };
    return {
      handled: true,
      reply:
        `Kanal klien (${channels.length}):\n` +
        channels.map((c) => `• ${c.channel}:${c.externalId} → proyek ${c.projectId?.slice(0, 8) ?? "-"}`).join("\n"),
    };
  }

  const prdMatch = raw.match(/^(?:buat\s+)?prd\s+([A-Za-z0-9-]{6,})\s*(.*)$/i);
  if (prdMatch) {
    const leadId = prdMatch[1]!;
    try {
      const result = await runScoper({ leadId });
      return {
        handled: true,
        reply:
          `📄 PRD dibuat: ${result.title}\n` +
          `Requirements: ${result.prd.requirements.length} · Pertanyaan terbuka: ${result.openQuestions.length}\n` +
          `File: ${result.prdPath}`,
      };
    } catch (err) {
      return { handled: true, reply: `Gagal membuat PRD: ${(err as Error).message}` };
    }
  }
  if (/^(briefing|brief|ringkasan)\b/.test(command)) {
    const snapshot = await buildBriefingSnapshot();
    const body = formatBriefing(snapshot);
    await notifyOwner({ title: "Briefing (manual)", body });
    await scheduleNextBriefing();
    return { handled: true, reply: body };
  }

  if (/^(status|pipeline)\b/.test(command)) {
    return { handled: true, reply: formatBriefing(await buildBriefingSnapshot()) };
  }

  if (/^(pending|approvals|approval)\b/.test(command)) {
    const pending = await listApprovals(50, "pending");
    if (pending.length === 0) return { handled: true, reply: "Tidak ada approval tertunda." };
    const lines = pending.map((a) => `• ${shortId(a.id)} — ${a.title}`);
    return { handled: true, reply: `Approval tertunda (${pending.length}):\n${lines.join("\n")}` };
  }

  if (/^(tick|proses job)\b/.test(command)) {
    const { processed } = await processDueJobs();
    return { handled: true, reply: `Job diproses: ${processed}.` };
  }

  if (/^(help|bantuan|perintah)\b/.test(command)) {
    return { handled: true, reply: HELP };
  }

  return { handled: false, reply: "" };
}
