import { z } from "zod";
import { traceEntry } from "../../graph/nodes/helpers.js";
import { structuredInvoke } from "../../llm/index.js";
import { briefBlock, formatterPrompt, sectionList } from "../prompts.js";
import { effectiveSections } from "../brief.js";
import type { ResearchStateType, ResearchUpdateType } from "../state.js";
import type { Citation } from "../types.js";
import { writeJsonFile, writeTextFile } from "../workspace.js";

const FormatSchema = z.object({
  summary: z.string(),
  sections: z.array(z.object({ heading: z.string(), content: z.string() })),
});

/**
 * Node 5 — Schema-Driven Formatter.
 *
 * Menyusun laporan mengikuti struktur bagian pada brief, menulis
 * `report.md` + `report.json` ke workspace, dan mengembalikan format yang
 * diminta (`markdown` atau `json`).
 */
export async function formatNode(
  state: ResearchStateType,
): Promise<ResearchUpdateType> {
  const brief = state.brief;
  if (!brief) return { errors: ["formatter: brief kosong"] };

  const citations: Citation[] = state.sources.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
  }));
  const citationList = citations.map((c) => `[${c.id}] ${c.title} — ${c.url}`).join("\n");
  const factList = state.facts
    .slice(0, 80)
    .map((f) => `[${f.sourceId}] ${f.claim}`)
    .join("\n");

  const human = [
    briefBlock(brief),
    `Struktur bagian yang WAJIB diikuti:\n${sectionList(brief)}`,
    `Fakta (angka dalam [n] = sumber):\n${factList || "(belum ada fakta)"}`,
    `Daftar sumber:\n${citationList || "(tidak ada sumber)"}`,
    "Susun laporan akhir sekarang.",
  ].join("\n\n");

  try {
    const out = await structuredInvoke({
      schema: FormatSchema,
      system: formatterPrompt.system,
      human,
      name: "ResearchReport",
      temperature: 0.3,
    });
    return await finalize(state, out.summary, out.sections, citations);
  } catch (err) {
    const summary =
      state.facts
        .slice(0, 6)
        .map((f) => `- ${f.claim}`)
        .join("\n") || "Riset selesai, namun tidak ada fakta yang berhasil diekstrak.";
    const sections = effectiveSections(brief).map((s) => ({
      heading: s.heading,
      content: state.facts.length ? "-" : "_(data belum tersedia)_",
    }));
    return await finalize(state, summary, sections, citations, [
      `formatter: ${(err as Error).message}`,
    ]);
  }
}

async function finalize(
  state: ResearchStateType,
  summary: string,
  sections: Array<{ heading: string; content: string }>,
  citations: Citation[],
  errors: string[] = [],
): Promise<ResearchUpdateType> {
  const brief = state.brief!;
  const generatedAt = new Date().toISOString();
  const citationBlock = citations.map((c) => `[${c.id}] ${c.title} — ${c.url}`).join("\n");

  const markdown = [
    `# ${brief.title}`,
    "",
    `> ${brief.objective}`,
    "",
    `_Dibuat: ${generatedAt} · ${citations.length} sumber · ${state.facts.length} fakta · kualitas ${state.quality.toFixed(1)}/10_`,
    "",
    ...sections.flatMap((s) => [`## ${s.heading}`, "", s.content, ""]),
    "## Sumber",
    "",
    citationBlock || "_(tidak ada)_",
    "",
  ].join("\n");

  const json = {
    title: brief.title,
    objective: brief.objective,
    generatedAt,
    language: brief.language,
    summary,
    sections,
    citations,
  };

  await writeTextFile(state.workspaceDir, "report.md", markdown);
  await writeJsonFile(state.workspaceDir, "report.json", json);

  const report = brief.format === "json" ? JSON.stringify(json, null, 2) : markdown;

  return {
    report,
    reportFormat: brief.format,
    summary,
    ...(errors.length ? { errors } : {}),
    trace: [
      traceEntry("formatter", { sections: sections.length, chars: report.length, format: brief.format }),
    ],
  };
}
