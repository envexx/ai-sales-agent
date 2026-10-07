import { z } from "zod";
import { env } from "../config/env.js";
import type { ResearchBrief, ResearchSection } from "./types.js";

/** Skema brief — dipakai API (`POST /research`) dan supervisor. */
export const ResearchBriefSchema = z.object({
  title: z.string().min(3).max(200),
  objective: z.string().min(10),
  questions: z.array(z.string().min(3)).max(12).optional(),
  depth: z.number().int().min(1).max(5).optional(),
  maxIterations: z.number().int().min(1).max(8).optional(),
  maxSources: z.number().int().min(1).max(50).optional(),
  timeBudgetMs: z.number().int().min(10_000).max(30 * 60_000).optional(),
  seedUrls: z.array(z.string().url()).max(25).optional(),
  includeDomains: z.array(z.string()).max(50).optional(),
  excludeDomains: z.array(z.string()).max(50).optional(),
  language: z.string().min(2).max(20).optional(),
  format: z.enum(["markdown", "json"]).optional(),
  sections: z
    .array(z.object({ heading: z.string().min(1), description: z.string().optional() }))
    .max(20)
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ResearchBriefInput = z.input<typeof ResearchBriefSchema>;

export interface NormalizeOptions {
  /** Batas ketat untuk riset yang dipicu dari chat (harus singkat). */
  chat?: boolean;
  reportId?: string;
}

/** Isi default dan batas agar brief selalu lengkap serta aman dijalankan. */
export function normalizeBrief(
  input: ResearchBriefInput,
  opts: NormalizeOptions = {},
): ResearchBrief {
  const parsed = ResearchBriefSchema.parse(input);
  const chat = opts.chat ?? false;

  const depth = parsed.depth ?? env.RESEARCH_DEFAULT_DEPTH;
  // Riset via chat dibatasi agar tidak memblokir turn percakapan.
  const maxIterations = chat
    ? Math.min(parsed.maxIterations ?? env.RESEARCH_CHAT_MAX_ITERATIONS, env.RESEARCH_CHAT_MAX_ITERATIONS)
    : parsed.maxIterations ?? env.RESEARCH_MAX_ITERATIONS;
  const maxSources = chat
    ? Math.min(parsed.maxSources ?? env.RESEARCH_CHAT_MAX_SOURCES, env.RESEARCH_CHAT_MAX_SOURCES)
    : parsed.maxSources ?? env.RESEARCH_MAX_SOURCES;
  const timeBudgetMs = chat
    ? Math.min(parsed.timeBudgetMs ?? env.RESEARCH_CHAT_TIME_BUDGET_MS, env.RESEARCH_CHAT_TIME_BUDGET_MS)
    : parsed.timeBudgetMs ?? env.RESEARCH_TIME_BUDGET_MS;

  return {
    title: parsed.title.trim(),
    objective: parsed.objective.trim(),
    questions: parsed.questions ?? [],
    depth,
    maxIterations,
    maxSources,
    timeBudgetMs,
    seedUrls: parsed.seedUrls ?? [],
    includeDomains: parsed.includeDomains ?? [],
    excludeDomains: parsed.excludeDomains ?? [],
    language: parsed.language ?? "id",
    format: parsed.format ?? "markdown",
    sections: parsed.sections ?? [],
    metadata: parsed.metadata ?? {},
  };
}

/** Bagian laporan default bila brief tidak menentukan sendiri. */
export function effectiveSections(brief: ResearchBrief): ResearchSection[] {
  if (brief.sections.length > 0) return brief.sections;
  return [
    { heading: "Ringkasan Eksekutif", description: "Temuan utama dalam 3-6 poin." },
    { heading: "Temuan Kunci", description: "Fakta penting, masing-masing dengan sitasi [n]." },
    { heading: "Analisis", description: "Pembahasan, pola, perbandingan, dan konteks." },
    { heading: "Keterbatasan & Data yang Hilang", description: "Apa yang belum terjawab." },
    { heading: "Kesimpulan & Rekomendasi", description: "Langkah berikutnya yang disarankan." },
  ];
}

/** Validasi ringan untuk body API; mengembalikan error per-field. */
export function validateBrief(input: unknown):
  | { ok: true; brief: ResearchBrief }
  | { ok: false; errors: Array<{ field: string; message: string }> } {
  const parsed = ResearchBriefSchema.safeParse(input);
  if (parsed.success) return { ok: true, brief: normalizeBrief(parsed.data) };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "(root)",
      message: issue.message,
    })),
  };
}
