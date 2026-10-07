/**
 * Tipe untuk Research Prospecting (D1 · Growth & Acquisition).
 *
 * Brief: niche + lokasi → daftar prospek. Hasil akhir disimpan ke tabel
 * `leads` (kind='prospect') agar langsung nyambung ke outreach Sales.
 */

export interface ProspectBrief {
  /** Jenis bisnis, mis. "klinik kecantikan", "jasa logistik". */
  niche: string;
  /** Kota/area, mis. "Bandung". */
  location: string;
  /** Batas jumlah kandidat dari Maps. */
  limit: number;
  /** Lakukan enrichment (cari telepon/website via pencarian web). */
  enrich: boolean;
  /** Masukkan lead yang berhasil ke antrean outreach. */
  queue: boolean;
  /** Kecualikan bisnis yang bergerak di bidang teknologi. */
  excludeTech: boolean;
  language: string;
}

export type ProspectSource = "google_maps";

export interface ProspectCard {
  name: string;
  source: ProspectSource;
  niche: string;
  location: string;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  email: string | null;
  address: string | null;
  /** Diisi bila berhasil disimpan ke `leads`. */
  leadId: string | null;
  saved: boolean;
  reason?: string;
  /** true bila dilewati karena termasuk bisnis teknologi. */
  excluded?: boolean;
  /** true bila dilewati karena nomor sudah ada di database (duplikat). */
  duplicate?: boolean;
}

export interface ProspectRunResult {
  id: string;
  brief: ProspectBrief;
  discovered: number;
  enriched: number;
  saved: number;
  skipped: number;
  /** Jumlah kandidat yang dilewati karena bisnis teknologi. */
  excluded: number;
  /** Jumlah kandidat yang dilewati karena nomor sudah ada (duplikat). */
  duplicates: number;
  cards: ProspectCard[];
  errors: string[];
  workspace: string;
}

/** Progres berjalan yang dikirim ke kanban (live). */
export interface ProspectProgress {
  phase: "maps" | "enrich" | "save" | "done" | "failed";
  niche: string;
  location: string;
  /** Kandidat dari Maps (0 sampai discovery selesai). */
  total: number;
  /** Kandidat yang sudah diproses (enrichment/simpan). */
  processed: number;
  enriched: number;
  saved: number;
  skipped: number;
  excluded: number;
  /** Kandidat yang dilewati karena nomor sudah ada (duplikat). */
  duplicates: number;
  message?: string;
}

export type ProspectProgressCallback = (progress: ProspectProgress) => void | Promise<void>;
