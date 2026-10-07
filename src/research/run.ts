import { randomUUID } from "node:crypto";
import { relative, resolve } from "node:path";
import { loggerFor } from "../config/logger.js";
import { createResearchReport, updateResearchReport } from "../repository/index.js";
import { normalizeBrief, type ResearchBriefInput } from "./brief.js";
import { getResearchGraph } from "./index.js";
import { emptyUsageValue, type ResearchStateType } from "./state.js";
import type { ResearchReport } from "./types.js";
import { ensureReportWorkspace, workspaceRoot, writeJsonFile } from "./workspace.js";

const log = loggerFor("research:run");

export interface RunResearchOptions {
  /** true = batas ketat (dipakai saat dipicu dari chat/WhatsApp). */
  chat?: boolean;
  reportId?: string;
}

/**
 * Menjalankan satu pekerjaan riset dari brief sampai laporan.
 *
 * Metadata masuk Postgres (`research_reports`); laporan + evidence ditulis ke
 * folder workspace `RESEARCH_WORKSPACE_DIR/<reportId>/`.
 */
export async function runResearch(
  input: ResearchBriefInput,
  opts: RunResearchOptions = {},
): Promise<ResearchReport> {
  const brief = normalizeBrief(input, { chat: opts.chat });
  const reportId = opts.reportId ?? randomUUID();
  const dir = await ensureReportWorkspace(reportId);
  const startedAt = new Date().toISOString();

  await writeJsonFile(dir, "brief.json", brief);
  await createResearchReport({ id: reportId, brief, workspace: dir });

  const graph = await getResearchGraph();

  try {
    const state = (await graph.invoke(
      {
        reportId,
        brief,
        workspaceDir: dir,
        startedAt,
        plan: [],
        searchResults: [],
        sources: [],
        facts: [],
        processedSourceIds: [],
        gaps: [],
        iteration: 0,
        depth: 0,
        quality: 0,
        satisfied: false,
        summary: "",
        report: "",
        reportFormat: brief.format,
        usage: emptyUsageValue(),
        trace: [],
        errors: [],
      },
      {
        configurable: { thread_id: `research:${reportId}` },
        recursionLimit: 80,
      },
    )) as ResearchStateType;

    // Artefak tambahan: sumber (tanpa isi penuh), fakta, dan jejak eksekusi.
    await writeJsonFile(
      dir,
      "sources.json",
      state.sources.map(({ content: _content, ...meta }) => meta),
    );
    await writeJsonFile(dir, "facts.json", state.facts);
    await writeJsonFile(dir, "trace.json", {
      plan: state.plan,
      gaps: state.gaps,
      depth: state.depth,
      quality: state.quality,
      iterations: state.iteration,
      usage: state.usage,
      trace: state.trace,
      errors: state.errors,
    });

    const reportPath = resolve(dir, brief.format === "json" ? "report.json" : "report.md");

    await updateResearchReport({
      id: reportId,
      status: "completed",
      summary: state.summary,
      quality: state.quality,
      iterations: state.iteration,
      sourceCount: state.sources.length,
      factCount: state.facts.length,
      reportPath,
    });

    log.info(
      {
        reportId,
        sources: state.sources.length,
        facts: state.facts.length,
        iterations: state.iteration,
        quality: state.quality,
      },
      "research completed",
    );

    return {
      id: reportId,
      brief,
      status: "completed",
      summary: state.summary,
      quality: state.quality,
      iterations: state.iteration,
      sources: state.sources.map((s) => ({ id: s.id, title: s.title, url: s.url })),
      facts: state.facts,
      workspace: dir,
      reportPath,
      report: state.report,
      format: brief.format,
      usage: state.usage,
      errors: state.errors,
    };
  } catch (err) {
    await updateResearchReport({
      id: reportId,
      status: "failed",
      error: (err as Error).message,
    });
    log.error({ reportId, err: (err as Error).message }, "research failed");
    throw err;
  }
}

/** Path workspace relatif terhadap root (untuk ditampilkan di UI/chat). */
export function workspaceRelative(dir: string): string {
  return relative(workspaceRoot(), dir) || ".";
}
