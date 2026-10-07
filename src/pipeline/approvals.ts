import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { developerTelegramEnabled, notifyDeveloperApproval } from "../developer/telegram.js";
import { notifyOwner } from "../notifications/index.js";
import { emitEvent } from "./events.js";
import { decideApproval, enqueueJob, insertApproval, listApprovals } from "./repository.js";
import type { ApprovalRecord } from "./types.js";

const log = loggerFor("pipeline:approvals");

/**
 * Approval yang, saat disetujui, memicu job lanjutan (human-in-the-loop → eksekusi).
 * Payload approval diteruskan apa adanya ke job.
 */
const APPROVAL_FOLLOWUP_JOBS: Record<string, string> = {
  "developer.apply": "developer.apply",
  "developer.deploy": "developer.deploy",
};

/** ID singkat yang aman dibaca/di-balas lewat WhatsApp. */
export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/**
 * Minta persetujuan owner (human-in-the-loop).
 *
 * Membuat record + mengirim notifikasi WhatsApp berisi cara membalas
 * (`<PREFIX> APPROVE <id>` / `<PREFIX> REJECT <id>`).
 */
export async function requestApproval(params: {
  kind: string;
  title: string;
  summary?: string;
  payload?: Record<string, unknown>;
  requestedBy?: string;
  ttlHours?: number;
}): Promise<ApprovalRecord> {
  const ttlHours = params.ttlHours ?? env.APPROVAL_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000).toISOString();

  const approval = await insertApproval({
    kind: params.kind,
    title: params.title,
    summary: params.summary ?? null,
    payload: params.payload ?? {},
    requestedBy: params.requestedBy ?? "supervisor",
    expiresAt,
  });

  const id = shortId(approval.id);
  // Approval Developer dikirim lewat bot Telegram-nya sendiri (bila aktif),
  // agar owner bisa langsung Setujui/Tolak dari Telegram.
  if (approval.kind.startsWith("developer.") && developerTelegramEnabled()) {
    await notifyDeveloperApproval(approval);
  } else {
    await notifyOwner({
      title: `Persetujuan dibutuhkan: ${approval.title}`,
      body: [
        approval.summary ?? "",
        `ID: ${id}`,
        `Balas: ${env.APPROVAL_PREFIX} APPROVE ${id}`,
        `atau: ${env.APPROVAL_PREFIX} REJECT ${id} <catatan>`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  await emitEvent("approval.requested", {
    entityType: "approval",
    entityId: approval.id,
    payload: { kind: approval.kind, title: approval.title },
  });
  log.info({ id, kind: approval.kind }, "approval diminta");

  return approval;
}

/** Cari approval pending berdasarkan id atau prefix id. */
export async function findPendingApproval(prefixOrId: string): Promise<ApprovalRecord | null> {
  const target = prefixOrId.trim().toUpperCase();
  if (!target) return null;
  const pending = await listApprovals(200, "pending");
  return (
    pending.find(
      (a) => a.id.toUpperCase() === target || a.id.slice(0, 8).toUpperCase().startsWith(target),
    ) ?? null
  );
}

/** Putuskan approval berdasarkan prefix; kirim hasilnya ke owner. */
export async function decideByPrefix(
  prefixOrId: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  note?: string,
): Promise<ApprovalRecord | null> {
  const approval = await findPendingApproval(prefixOrId);
  if (!approval) return null;

  const updated = await decideApproval({
    id: approval.id,
    status: decision,
    decidedBy,
    note: note ?? null,
  });
  if (!updated) return null;

  await emitEvent(`approval.${decision}`, {
    entityType: "approval",
    entityId: updated.id,
    payload: { kind: updated.kind, note: note ?? null },
  });
  await notifyOwner({
    title: `Persetujuan ${decision === "approved" ? "DISETUJUI" : "DITOLAK"}: ${updated.title}`,
    body: note ? `Catatan: ${note}` : `ID: ${shortId(updated.id)}`,
  });

  // Human-in-the-loop → eksekusi: approval tertentu memicu job lanjutan.
  if (decision === "approved") {
    const followup = APPROVAL_FOLLOWUP_JOBS[updated.kind];
    if (followup) {
      const jobId = await enqueueJob({
        type: followup,
        payload: { ...updated.payload, approvalId: updated.id },
        priority: 1,
      });
      log.info({ kind: updated.kind, jobId }, "approval disetujui → job lanjutan dijadwalkan");
    }
  }

  return updated;
}
