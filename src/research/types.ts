/**
 * Tipe untuk Universal Research Engine.
 *
 * Semua parameter riset datang dari sebuah `ResearchBrief`, sehingga engine
 * yang sama bisa dipakai untuk kebutuhan riset apa pun (pasar, teknis, berita,
 * kompetitor, dsb.).
 */

export type ResearchFormat = "markdown" | "json";

export interface ResearchSection {
  heading: string;
  description?: string;
}

/** Konfigurasi satu pekerjaan riset — input utama engine. */
export interface ResearchBrief {
  title: string;
  /** Pertanyaan/objektif utama yang harus dijawab. */
  objective: string;
  /** Sub-pertanyaan opsional untuk memandu. */
  questions: string[];
  /** Target kedalaman 1-5 (semakin tinggi semakin banyak iterasi). */
  depth: number;
  maxIterations: number;
  maxSources: number;
  timeBudgetMs: number;
  /** URL awal opsional (dipakai tanpa discovery). */
  seedUrls: string[];
  includeDomains: string[];
  excludeDomains: string[];
  language: string;
  format: ResearchFormat;
  /** Struktur laporan; formatter mengikuti ini. */
  sections: ResearchSection[];
  metadata: Record<string, unknown>;
}

/** Satu tugas dari planner: pertanyaan + query pencariannya. */
export interface PlanTask {
  question: string;
  queries: string[];
  rationale: string;
}

/** Hasil discovery (sebelum diambil isinya). */
export interface SearchHit {
  url: string;
  title: string;
  description: string;
  query: string;
}

export type IngestEngine = "firecrawl" | "camoufox";

/** Satu halaman sumber yang berhasil diambil dan disimpan sebagai evidence. */
export interface SourceDoc {
  /** Nomor sitasi [n]. */
  id: number;
  url: string;
  title: string;
  engine: IngestEngine;
  fetchedAt: string;
  chars: number;
  /** Path relatif file evidence di dalam folder workspace. */
  file: string;
  /** Konten terpangkas untuk konteks LLM (evidence lengkap ada di file). */
  content: string;
}

/** Satu fakta hasil ekstraksi, selalu merujuk ke satu sumber. */
export interface Fact {
  id: number;
  claim: string;
  topic: string;
  confidence: number;
  sourceId: number;
  url: string;
  title: string;
  excerpt: string;
}

export interface ResearchUsage {
  searches: number;
  fetched: number;
  firecrawl: number;
  camoufox: number;
  /** Jumlah source yang gagal diambil. */
  failed: number;
}

export interface Citation {
  id: number;
  title: string;
  url: string;
}

export interface ResearchReport {
  id: string;
  brief: ResearchBrief;
  status: "running" | "completed" | "failed";
  summary: string;
  quality: number;
  iterations: number;
  sources: Citation[];
  facts: Fact[];
  workspace: string;
  reportPath: string | null;
  report: string;
  format: ResearchFormat;
  usage: ResearchUsage;
  errors: string[];
}

/** Ringkasan satu laporan untuk listing (dibaca dari database). */
export interface ResearchReportRecord {
  id: string;
  title: string;
  objective: string;
  status: string;
  format: ResearchFormat;
  language: string | null;
  workspace: string | null;
  summary: string | null;
  quality: number | null;
  iterations: number;
  sourceCount: number;
  factCount: number;
  brief: ResearchBrief;
  reportPath: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
