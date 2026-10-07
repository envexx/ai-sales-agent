/**
 * Registry agent yang bisa dipilih oleh supervisor.
 *
 * Menambah agent baru cukup dengan:
 *   1. tambahkan namanya di `AGENT_NAMES`,
 *   2. tambahkan entri di `AGENTS` (deskripsi dipakai supervisor untuk memilih),
 *   3. tambahkan node worker + cabang routing di `src/supervisor/index.ts`.
 */
export const AGENT_NAMES = ["sales", "prospecting"] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

export interface AgentDefinition {
  name: AgentName;
  title: string;
  /** Ringkasan kemampuan agent — dibaca supervisor saat memilih. */
  description: string;
}

export const AGENTS: readonly AgentDefinition[] = [
  {
    name: "sales",
    title: "Sales Agent (Nadia)",
    description:
      "Menangani percakapan penjualan B2B: tanya jawab produk/harga, kualifikasi lead, " +
      "menangani keberatan, menawarkan konsultasi, dan booking via Cal.com. " +
      "Jadikan ini pilihan utama untuk hampir semua pesan prospek.",
  },
  {
    name: "prospecting",
    title: "Research Prospecting",
    description:
      "Mencari daftar prospek bisnis (niche + kota) via Google Maps, melengkapi kontak, " +
      "lalu memasukkannya ke pipeline outreach. Pilih ini bila pesan meminta mencari " +
      "prospek/klien/bisnis baru untuk ditawari.",
  },
];

/** Agent default bila routing tidak yakin — fail-open agar lead tidak hilang. */
export const DEFAULT_AGENT: AgentName = "sales";

export function getAgent(name: AgentName): AgentDefinition {
  const found = AGENTS.find((agent) => agent.name === name);
  if (!found) throw new Error(`Unknown agent: ${name}`);
  return found;
}

/** Hasil satu agent setelah menangani sebuah turn. */
export interface AgentResult {
  agent: AgentName;
  reply: string;
  /** Ringkasan hasil agent (segment, skor, evaluasi, booking, …). */
  metadata: Record<string, unknown>;
}
