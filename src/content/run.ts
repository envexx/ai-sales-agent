import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { structuredInvoke } from "../llm/index.js";
import { ingestKnowledge, caseStudyExists } from "../memory/knowledge.js";
import { notifyOwner } from "../notifications/index.js";
import { emitEvent } from "../pipeline/events.js";
import { clientLabel, loadProjectContext } from "../pipeline/projectContext.js";

const log = loggerFor("content");

const CaseStudySchema = z.object({
  headline: z.string(),
  industry: z.string(),
  challenge: z.string(),
  solution: z.string(),
  results: z.array(z.string()).max(8),
  quote: z.string(),
});

export interface CaseStudyResult {
  projectId: string;
  path: string;
  headline: string;
  markdown: string;
  /** true bila studi kasus baru masuk ke knowledge base (flywheel). */
  ingested: boolean;
}

/**
 * Case Study & Content Engine (F5 · flywheel).
 *
 * Dipicu setelah proyek selesai. Menyusun studi kasus 1 halaman dengan nama
 * klien disamarkan, untuk memperkuat materi Sales & Prospecting berikutnya.
 */
export async function runCaseStudy(params: {
  projectId: string;
  results?: string[];
}): Promise<CaseStudyResult> {
  if (!env.CONTENT_ENABLED) throw new Error("Content nonaktif (CONTENT_ENABLED=false)");
  const ctx = await loadProjectContext(params.projectId);
  const client = clientLabel(ctx);

  const study = await structuredInvoke({
    schema: CaseStudySchema,
    system:
      "Kamu content writer agensi digital. Susun studi kasus 1 halaman yang meyakinkan namun jujur. " +
      "SAMARKAN identitas klien (gunakan industri + ukuran, bukan nama). Jangan mengarang angka; bila tidak ada data hasil, " +
      "tulis hasil secara kualitatif.",
    human: [
      `Industri klien (rahasia, jangan disebut nama): ${ctx.client?.company ? "tersedia" : "tidak diketahui"}.`,
      ctx.prd
        ? `Masalah & solusi: ${ctx.prd.summary}\nKebutuhan: ${ctx.prd.requirements.map((r) => r.title).join("; ")}`
        : "PRD tidak tersedia.",
      params.results?.length ? `Hasil terukur: ${params.results.join("; ")}` : "Hasil terukur: belum ada data.",
    ].join("\n\n"),
    name: "CaseStudy",
    temperature: 0.4,
  });

  const markdown = [
    `# ${study.headline}`,
    "",
    `_Industri: ${study.industry}_`,
    "",
    "## Tantangan",
    study.challenge,
    "",
    "## Solusi",
    study.solution,
    "",
    "## Hasil",
    ...study.results.map((r) => `- ${r}`),
    "",
    study.quote ? `> ${study.quote}` : "",
    "",
    "---",
    "_Nama klien disamarkan; detail dapat disesuaikan._",
    "",
  ].join("\n");

  const dir = resolve(ctx.dir, "content");
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, "CASE-STUDY.md");
  await writeFile(path, markdown, "utf8");

  await emitEvent("content.ready", {
    entityType: "project",
    entityId: params.projectId,
    payload: { headline: study.headline, industry: study.industry },
  });

  // ── Flywheel: masukkan studi kasus ke knowledge base agar dipakai Sales
  //    (RAG) dan Prospecting/Scout berikutnya. Idempoten per proyek.
  let ingested = false;
  if (!(await caseStudyExists(params.projectId))) {
    const salesSnippet = [
      `Studi kasus industri ${study.industry}.`,
      `Tantangan: ${study.challenge}`,
      `Solusi: ${study.solution}`,
      `Hasil: ${study.results.join("; ")}`,
    ].join("\n");

    await ingestKnowledge([
      {
        title: `Studi Kasus (${study.industry}): ${study.headline}`,
        content: markdown,
        source: "case_study",
        metadata: { projectId: params.projectId, industry: study.industry, kind: "case_study" },
      },
      {
        title: `Ringkasan Penjualan — Studi Kasus ${study.industry}`,
        content: salesSnippet,
        source: "case_study",
        metadata: { projectId: params.projectId, industry: study.industry, kind: "case_study_snippet" },
      },
    ]);

    ingested = true;
    await emitEvent("case_study.ingested", {
      entityType: "project",
      entityId: params.projectId,
      payload: { industry: study.industry, headline: study.headline },
    });
  }

  await notifyOwner({
    title: `Studi kasus siap: ${study.headline}`,
    body: `Industri: ${study.industry}\nFile: ${path}\nKnowledge base: ${ingested ? "diperbarui ✅" : "sudah ada"}`,
  });

  log.info({ projectId: params.projectId, headline: study.headline, ingested }, "studi kasus dibuat");
  return { projectId: params.projectId, path, headline: study.headline, markdown, ingested };
}
