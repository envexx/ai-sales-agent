import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { structuredInvoke } from "../llm/index.js";
import { emitEvent } from "../pipeline/events.js";
import { enqueueJob } from "../pipeline/repository.js";
import {
  createInvoice,
  getClient,
  getProject,
  listInvoicesByProject,
  markInvoicePaid,
  updateProject,
  type InvoiceRecord,
} from "../pipeline/entities.js";
import { notifyOwner } from "../notifications/index.js";
import type { Prd } from "../scoper/types.js";
import { legalPrompt } from "./prompts.js";
import type { LegalDraft, LegalResult } from "./types.js";

const log = loggerFor("legal");

const LegalSchema = z.object({
  contractTitle: z.string(),
  scopeSummary: z.string(),
  deliverables: z.array(z.string()).max(25),
  timeline: z.string(),
  paymentTerms: z.string(),
  clauses: z
    .array(z.object({ title: z.string(), body: z.string() }))
    .max(20),
  ndaClauses: z
    .array(z.object({ title: z.string(), body: z.string() }))
    .max(20),
});

const DISCLAIMER =
  "> ⚠️ DRAF yang dihasilkan AI. WAJIB ditinjau dan disesuaikan sebelum ditandatangani. Ini bukan nasihat hukum.";

function formatIDR(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

async function loadPrd(prdPath: string | null): Promise<Prd | null> {
  if (!prdPath) return null;
  try {
    const raw = await readFile(resolve(dirname(prdPath), "PRD.json"), "utf8");
    return (JSON.parse(raw).prd ?? null) as Prd | null;
  } catch {
    return null;
  }
}

function renderContract(params: {
  title: string;
  clientName: string;
  provider: string;
  amount: number;
  draft: LegalDraft;
  generatedAt: string;
}): string {
  const { draft } = params;
  return [
    `# ${draft.contractTitle || params.title}`,
    "",
    DISCLAIMER,
    "",
    `Dibuat: ${params.generatedAt}`,
    "",
    "## Para Pihak",
    `- **Penyedia Jasa:** ${params.provider}`,
    `- **Klien:** ${params.clientName}`,
    "",
    "## Ruang Lingkup",
    draft.scopeSummary,
    "",
    "## Deliverable",
    ...draft.deliverables.map((d) => `- ${d}`),
    "",
    "## Timeline",
    draft.timeline,
    "",
    "## Termin Pembayaran",
    `${draft.paymentTerms}\n- Down Payment (DP): **${formatIDR(params.amount)}** (dibayar sebelum pekerjaan dimulai).`,
    "",
    "## Klausul",
    ...draft.clauses.flatMap((c) => [`### ${c.title}`, "", c.body, ""]),
    "## Tanda Tangan",
    "",
    "| Penyedia Jasa | Klien |",
    "| --- | --- |",
    "|  |  |",
    "",
  ].join("\n");
}

function renderNda(params: {
  clientName: string;
  provider: string;
  clauses: { title: string; body: string }[];
  generatedAt: string;
}): string {
  return [
    "# Perjanjian Kerahasiaan (NDA)",
    "",
    DISCLAIMER,
    "",
    `Dibuat: ${params.generatedAt}`,
    "",
    `Antara **${params.provider}** dan **${params.clientName}**.`,
    "",
    ...params.clauses.flatMap((c) => [`## ${c.title}`, "", c.body, ""]),
    "## Tanda Tangan",
    "",
    "| Penyedia Jasa | Klien |",
    "| --- | --- |",
    "|  |  |",
    "",
  ].join("\n");
}

function renderInvoice(params: {
  invoiceNo: string;
  clientName: string;
  provider: string;
  amount: number;
  dueAt: string;
  generatedAt: string;
}): { md: string; html: string } {
  const md = [
    `# Invoice DP — ${params.invoiceNo}`,
    "",
    `- **Penyedia:** ${params.provider}`,
    `- **Klien:** ${params.clientName}`,
    `- **Jumlah:** ${formatIDR(params.amount)}`,
    `- **Jatuh tempo:** ${params.dueAt}`,
    `- **Dibuat:** ${params.generatedAt}`,
    "",
    "Pembayaran DP wajib diterima sebelum pekerjaan dimulai.",
    "",
  ].join("\n");

  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Invoice DP ${params.invoiceNo}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#111}
h1{font-size:22px}table{border-collapse:collapse;width:100%;margin-top:16px}
td,th{border:1px solid #ddd;padding:8px;text-align:left}.total{font-weight:700}</style></head>
<body>
<h1>Invoice — Down Payment</h1>
<p><strong>No:</strong> ${params.invoiceNo}</p>
<p><strong>Penyedia:</strong> ${params.provider}<br>
<strong>Klien:</strong> ${params.clientName}</p>
<table><tr><th>Deskripsi</th><th>Jumlah</th></tr>
<tr><td>Down Payment (DP) proyek</td><td class="total">${formatIDR(params.amount)}</td></tr></table>
<p style="margin-top:16px"><strong>Jatuh tempo:</strong> ${params.dueAt}</p>
<p style="color:#666;font-size:12px">Dokumen ini dihasilkan otomatis.</p>
</body></html>`;

  return { md, html };
}

export interface LegalInput {
  projectId?: string | null;
  /** Nominal DP dalam Rupiah. Wajib (kecuali tersedia di meta proyek). */
  amount?: number | null;
  currency?: string;
  includeNda?: boolean;
}

/**
 * Legal & Finance (F2).
 *
 * Dari PRD proyek → draf SPK + NDA + invoice DP. Invoice tercatat di tabel
 * `invoices`; dokumen ditulis ke `workspace/projects/<projectId>/legal/`.
 * Pembayaran DP dikonfirmasi terpisah (API/perintah owner) → event `invoice.dp_paid`.
 */
export async function runLegal(input: LegalInput): Promise<LegalResult> {
  if (!env.LEGAL_ENABLED) throw new Error("Legal nonaktif (LEGAL_ENABLED=false)");

  const project = input.projectId ? await getProject(input.projectId) : null;
  if (!project) throw new Error("projectId tidak ditemukan");

  const client = project.clientId ? await getClient(project.clientId) : null;
  const prd = await loadPrd(project.prdPath);

  const amount = input.amount ?? (project.meta as { quote?: number }).quote;
  if (!amount || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Nominal DP (amount) wajib diisi dan > 0");
  }

  const currency = input.currency ?? "IDR";
  const clientName = client?.company ?? client?.name ?? project.title;
  const generatedAt = new Date().toISOString();

  const human = [
    `Klien: ${clientName}`,
    `Proyek: ${project.title}`,
    prd
      ? `Ringkasan PRD:\n${prd.summary}\n\nRuang lingkup (in scope):\n- ${prd.scope.inScope.join("\n- ")}\n\nDeliverable/kebutuhan:\n- ${prd.requirements
          .map((r) => `${r.title}: ${r.description}`)
          .join("\n- ")}`
      : "PRD belum tersedia — gunakan informasi proyek seadanya dan tandai [PERLU DIISI].",
    "Susun draf kontrak, NDA, dan ketentuan pembayaran.",
  ].join("\n\n");

  const draft = (await structuredInvoke({
    schema: LegalSchema,
    system: legalPrompt.system,
    human,
    name: "LegalDraft",
    temperature: 0.2,
  })) as LegalDraft;

  const workspace = project.workspace ?? resolve(process.cwd(), env.PROJECTS_WORKSPACE_DIR, project.id);
  const legalDir = resolve(workspace, "legal");
  await mkdir(legalDir, { recursive: true });

  const dueAt = new Date(Date.now() + env.LEGAL_DUE_DAYS * 86_400_000).toISOString();
  const invoiceId = await createInvoice({
    clientId: project.clientId,
    projectId: project.id,
    kind: "dp",
    amount,
    currency,
    status: "sent",
    dueAt,
    payload: { projectTitle: project.title, generatedAt },
  });
  const invoiceNo = `INV-DP-${invoiceId.slice(0, 8).toUpperCase()}`;

  const contractPath = resolve(legalDir, "SPK.md");
  const ndaPath = resolve(legalDir, "NDA.md");
  const invoicePath = resolve(legalDir, "INVOICE-DP.md");
  await writeFile(
    contractPath,
    renderContract({
      title: project.title,
      clientName,
      provider: env.BUSINESS_NAME,
      amount,
      draft,
      generatedAt,
    }),
    "utf8",
  );
  await writeFile(
    ndaPath,
    renderNda({ clientName, provider: env.BUSINESS_NAME, clauses: draft.ndaClauses, generatedAt }),
    "utf8",
  );
  const invoice = renderInvoice({
    invoiceNo,
    clientName,
    provider: env.BUSINESS_NAME,
    amount,
    dueAt: dueAt.slice(0, 10),
    generatedAt,
  });
  await writeFile(invoicePath, invoice.md, "utf8");
  await writeFile(resolve(legalDir, "INVOICE-DP.html"), invoice.html, "utf8");

  await updateProject({
    id: project.id,
    meta: {
      legal: {
        invoiceId,
        invoiceNo,
        amount,
        currency,
        status: "sent",
        dueAt,
        docs: { contractPath, ndaPath, invoicePath },
        at: generatedAt,
      },
    },
  });

  await emitEvent("legal.ready", {
    entityType: "project",
    entityId: project.id,
    payload: { invoiceId, amount, currency, invoiceNo },
  });
  await notifyOwner({
    title: `Draf legal siap: ${project.title}`,
    body:
      `Invoice DP ${invoiceNo}: ${formatIDR(amount)} (jatuh tempo ${dueAt.slice(0, 10)}).\n` +
      `Dokumen: ${legalDir}`,
  });

  log.info({ projectId: project.id, invoiceId, amount }, "draf legal dibuat");

  return {
    projectId: project.id,
    clientId: project.clientId,
    invoiceId,
    amount,
    currency,
    status: "sent",
    contractPath,
    ndaPath,
    invoicePath,
    workspace,
    draft,
  };
}

/** Tandai invoice DP proyek sebagai lunas → event `invoice.dp_paid`. */
export async function markProjectInvoicePaid(projectId: string): Promise<InvoiceRecord | null> {
  const invoices = await listInvoicesByProject(projectId);
  const unpaid = invoices.find((i) => i.status !== "paid");
  if (!unpaid) return null;

  const paid = await markInvoicePaid(unpaid.id);
  if (!paid) return null;

  const isFinal = paid.kind === "final";
  await emitEvent(isFinal ? "invoice.final_paid" : "invoice.dp_paid", {
    entityType: "project",
    entityId: projectId,
    payload: { invoiceId: paid.id, kind: paid.kind, amount: paid.amount, currency: paid.currency },
  });

  // Rantai otomatis berikutnya.
  if (isFinal) {
    await updateProject({ id: projectId, stage: "delivered" });
    await enqueueJob({ type: "content.case_study", payload: { projectId } });
    await enqueueJob({ type: "developer.maintain", payload: { projectId } });
  } else {
    await enqueueJob({ type: "intake.collect", payload: { projectId } });
  }

  await notifyOwner({
    title: `${isFinal ? "Pelunasan" : "DP"} lunas: ${projectId.slice(0, 8)}`,
    body: `${formatIDR(paid.amount)} diterima.${
      isFinal ? " Proyek ditandai delivered." : " Proyek siap untuk Intake & Credential."
    }`,
  });
  log.info({ projectId, invoiceId: paid.id, kind: paid.kind }, "invoice lunas");
  return paid;
}
