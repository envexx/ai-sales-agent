import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../config/env.js";
import { slugify } from "./util.js";

/**
 * Workspace evidence untuk satu laporan riset.
 *
 *   <RESEARCH_WORKSPACE_DIR>/<reportId>/
 *     brief.json
 *     sources.json
 *     facts.json
 *     report.md / report.json
 *     trace.json
 *     evidence/<n>-<slug>.md
 *     evidence/<n>-<slug>.html
 */
export function workspaceRoot(): string {
  return resolve(process.cwd(), env.RESEARCH_WORKSPACE_DIR);
}

export function reportDir(reportId: string): string {
  return resolve(workspaceRoot(), reportId);
}

/** Buat folder workspace + subfolder evidence, kembalikan path-nya. */
export async function ensureReportWorkspace(reportId: string): Promise<string> {
  const dir = reportDir(reportId);
  await mkdir(resolve(dir, "evidence"), { recursive: true });
  return dir;
}

export async function writeTextFile(dir: string, name: string, text: string): Promise<string> {
  const path = resolve(dir, name);
  await writeFile(path, text, "utf8");
  return path;
}

export async function writeJsonFile(
  dir: string,
  name: string,
  data: unknown,
): Promise<string> {
  return writeTextFile(dir, name, `${JSON.stringify(data, null, 2)}\n`);
}

/** Nama file evidence berdasarkan urutan sumber + judul. */
export function evidenceName(index: number, title: string, ext = "md"): string {
  return `evidence/${index}-${slugify(title)}.${ext}`;
}

/** Daftar file evidence pada folder workspace satu laporan. */
export async function listEvidenceFiles(
  reportId: string,
): Promise<Array<{ name: string; size: number }>> {
  const dir = resolve(reportDir(reportId), "evidence");
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const info = await stat(resolve(dir, entry.name));
          return { name: entry.name, size: info.size };
        }),
    );
    return files.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
