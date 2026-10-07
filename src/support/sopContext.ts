import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadProjectContext } from "../pipeline/projectContext.js";

/**
 * Ambil bagian SOP/panduan proyek yang relevan dengan pesan klien.
 *
 * Sumber: `workspace/projects/<id>/docs/SOP.md` + `PANDUAN.md` (hasil agent
 * Scribe). Pemilihan berbasis kata kunci sederhana, dibatasi `maxChars`.
 */
export async function loadSopContext(
  projectId: string,
  message: string,
  maxChars = 4000,
): Promise<string> {
  let dir: string;
  try {
    dir = (await loadProjectContext(projectId)).dir;
  } catch {
    return "";
  }

  const files = [resolve(dir, "docs", "SOP.md"), resolve(dir, "docs", "PANDUAN.md")];
  const parts: string[] = [];
  for (const file of files) {
    try {
      parts.push(await readFile(file, "utf8"));
    } catch {
      /* file belum ada */
    }
  }
  if (parts.length === 0) return "";

  const paragraphs = parts
    .join("\n\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const keywords = message
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);

  const scored = paragraphs
    .map((p) => ({
      p,
      score: keywords.reduce((n, k) => n + (p.toLowerCase().includes(k) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);

  const relevant = scored.filter((x) => x.score > 0).slice(0, 12).map((x) => x.p);
  const chosen = relevant.length > 0 ? relevant : paragraphs.slice(0, 12);
  return chosen.join("\n\n").slice(0, maxChars);
}
