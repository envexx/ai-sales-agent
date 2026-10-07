import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { structuredInvoke } from "../llm/index.js";
import { notifyOwner } from "../notifications/index.js";
import { emitEvent } from "../pipeline/events.js";
import { enqueueJob } from "../pipeline/repository.js";
import { setProjectStage } from "../pipeline/lifecycle.js";
import { clientLabel, loadProjectContext } from "../pipeline/projectContext.js";

const log = loggerFor("scribe");

const DocsSchema = z.object({
  sopSteps: z
    .array(z.object({ step: z.string(), detail: z.string() }))
    .max(40),
  troubleshooting: z
    .array(z.object({ issue: z.string(), solution: z.string() }))
    .max(25),
  userGuide: z.string(),
});

export interface ScribeResult {
  projectId: string;
  sopPath: string;
  guidePath: string;
  steps: number;
}

/**
 * Documentation & SOP Builder (F3).
 *
 * Dipicu `qa.passed`. Dari PRD + alur + laporan QA, menghasilkan SOP operasional
 * untuk staf klien dan panduan pengguna.
 */
export async function runScribe(projectId: string): Promise<ScribeResult> {
  if (!env.SCRIBE_ENABLED) throw new Error("Scribe nonaktif (SCRIBE_ENABLED=false)");
  const ctx = await loadProjectContext(projectId);

  let qaReport = "";
  try {
    const { readFile } = await import("node:fs/promises");
    qaReport = (await readFile(resolve(ctx.dir, "qa", "QA-REPORT.md"), "utf8")).slice(0, 6000);
  } catch {
    qaReport = "(laporan QA tidak ditemukan)";
  }

  const human = [
    `Klien: ${clientLabel(ctx)} · Proyek: ${ctx.project.title}`,
    ctx.prd
      ? `Kebutuhan: ${ctx.prd.requirements.map((r) => r.title).join("; ")}\nAlur: ${ctx.prd.flows
          .map((f) => `${f.name}: ${f.steps.join(" → ")}`)
          .join(" | ")}`
      : "PRD tidak tersedia.",
    `Ringkasan QA:\n${qaReport}`,
    "Susun SOP langkah demi langkah untuk staf klien dan panduan penggunaan singkat.",
  ].join("\n\n");

  const docs = await structuredInvoke({
    schema: DocsSchema,
    system:
      "Kamu technical writer yang menyusun SOP operasional dan panduan pengguna untuk staf non-teknis. " +
      "Langkah harus actionable, jelas, dan berurutan. Hindari jargon yang tidak perlu.",
    human,
    name: "ScribeDocs",
    temperature: 0.3,
  });

  const dir = resolve(ctx.dir, "docs");
  await mkdir(dir, { recursive: true });
  const sopPath = resolve(dir, "SOP.md");
  const guidePath = resolve(dir, "PANDUAN.md");

  await writeFile(
    sopPath,
    [
      `# SOP Operasional — ${ctx.project.title}`,
      "",
      `Klien: ${clientLabel(ctx)}`,
      "",
      "## Langkah Operasional",
      ...docs.sopSteps.map((s, i) => `${i + 1}. **${s.step}** — ${s.detail}`),
      "",
      "## Troubleshooting",
      ...docs.troubleshooting.map((t) => `- **${t.issue}** → ${t.solution}`),
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    guidePath,
    [`# Panduan Pengguna — ${ctx.project.title}`, "", docs.userGuide, ""].join("\n"),
    "utf8",
  );

  await emitEvent("docs.ready", {
    entityType: "project",
    entityId: projectId,
    payload: { sopPath, guidePath, steps: docs.sopSteps.length },
  });
  await notifyOwner({
    title: `Dokumentasi siap: ${ctx.project.title}`,
    body: `${docs.sopSteps.length} langkah SOP · ${docs.troubleshooting.length} troubleshooting.\nFolder: ${dir}`,
  });
  // QA + Dokumentasi selesai & oke → naikkan status proyek menjadi DONE.
  await setProjectStage(projectId, "done");
  await enqueueJob({ type: "handover.finalize", payload: { projectId } });

  log.info({ projectId, steps: docs.sopSteps.length }, "dokumentasi dibuat");
  return { projectId, sopPath, guidePath, steps: docs.sopSteps.length };
}
