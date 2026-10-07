import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { requestApproval } from "../pipeline/approvals.js";
import { createInvoice, listInvoicesByProject, updateProject } from "../pipeline/entities.js";
import { clientLabel, loadProjectContext } from "../pipeline/projectContext.js";
import { emitEvent } from "../pipeline/events.js";
import { notifyOwner } from "../notifications/index.js";

const log = loggerFor("handover");

export interface HandoverResult {
  projectId: string;
  bastPath: string;
  finalInvoiceId: string | null;
  finalAmount: number | null;
  approvalId: string;
}

/**
 * Handover & Final Invoice (F4).
 *
 * Dipicu setelah dokumentasi siap. Menghasilkan Berita Acara Serah Terima (BAST)
 * dan (bila nilai kontrak diberikan) invoice pelunasan. Mengirim BAST ke klien
 * menunggu **persetujuan owner**.
 */
export async function runHandover(params: {
  projectId: string;
  totalAmount?: number | null;
}): Promise<HandoverResult> {
  if (!env.HANDOVER_ENABLED) throw new Error("Handover nonaktif (HANDOVER_ENABLED=false)");
  const ctx = await loadProjectContext(params.projectId);
  const generatedAt = new Date().toISOString();

  const dir = resolve(ctx.dir, "handover");
  await mkdir(dir, { recursive: true });
  const bastPath = resolve(dir, "BAST.md");
  await writeFile(
    bastPath,
    [
      `# Berita Acara Serah Terima (BAST) — ${ctx.project.title}`,
      "",
      `Klien: ${clientLabel(ctx)}`,
      `Tanggal: ${generatedAt.slice(0, 10)}`,
      "",
      "## Objek Serah Terima",
      ...(ctx.prd
        ? ctx.prd.requirements.map((r) => `- ${r.title} — ${r.description}`)
        : ["- (deliverable mengikuti kesepakatan)"]),
      "",
      "## Dokumentasi",
      "- SOP operasional dan panduan pengguna (folder `docs/`).",
      "",
      "## Uji Terima (UAT)",
      "- [ ] Klien memverifikasi fungsi utama.",
      "- [ ] Klien menyetujui hasil.",
      "",
      "| Penyedia Jasa | Klien |",
      "| --- | --- |",
      "|  |  |",
      "",
    ].join("\n"),
    "utf8",
  );

  // Invoice pelunasan (final) bila nilai total diberikan.
  let finalInvoiceId: string | null = null;
  let finalAmount: number | null = null;
  if (params.totalAmount && params.totalAmount > 0) {
    const invoices = await listInvoicesByProject(params.projectId);
    const paid = invoices
      .filter((i) => i.status === "paid" && i.kind === "dp")
      .reduce((sum, i) => sum + i.amount, 0);
    finalAmount = Math.max(0, params.totalAmount - paid);
    if (finalAmount > 0) {
      finalInvoiceId = await createInvoice({
        clientId: ctx.project.clientId,
        projectId: params.projectId,
        kind: "final",
        amount: finalAmount,
        status: "draft",
        payload: { totalAmount: params.totalAmount, dpPaid: paid, generatedAt },
      });
    }
  }

  const approval = await requestApproval({
    kind: "handover.send",
    title: `Kirim BAST & invoice pelunasan: ${ctx.project.title}`,
    summary:
      `Klien: ${clientLabel(ctx)}.` +
      (finalAmount != null ? ` Pelunasan: Rp ${finalAmount.toLocaleString("id-ID")}.` : " Tanpa invoice pelunasan."),
    payload: { projectId: params.projectId, bastPath, finalInvoiceId, finalAmount },
  });

  await updateProject({
    id: params.projectId,
    meta: { handover: { bastPath, finalInvoiceId, finalAmount, approvalId: approval.id, at: generatedAt } },
  });
  await emitEvent("handover.ready", {
    entityType: "project",
    entityId: params.projectId,
    payload: { bastPath, finalInvoiceId, finalAmount, approvalId: approval.id },
  });
  await notifyOwner({
    title: `Handover siap: ${ctx.project.title}`,
    body: `BAST dibuat.\nPersetujuan: ${approval.id.slice(0, 8).toUpperCase()}`,
  });

  log.info({ projectId: params.projectId, finalAmount }, "handover dibuat");
  return { projectId: params.projectId, bastPath, finalInvoiceId, finalAmount, approvalId: approval.id };
}
