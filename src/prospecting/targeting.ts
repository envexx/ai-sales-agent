/**
 * Targeting untuk Research Prospecting.
 *
 * Tujuan: mengarahkan prospecting ke bisnis yang **butuh otomasi/AI** tetapi
 * umumnya **awam teknologi** (volume chat tinggi, proses berulang, tim kecil),
 * dan **mengecualikan** bisnis yang bergerak di bidang teknologi (software house,
 * agensi digital, konsultan IT, SaaS, dsb.) karena mereka sudah paham otomasi.
 *
 * Katalog di bawah adalah default yang bisa disunting. Pemilihan niche dilakukan
 * deterministik berdasarkan `priority` (1 = paling diprioritaskan).
 */

export interface TargetVertical {
  /** Query pencarian (niche) yang dikirim ke Maps. */
  niche: string;
  /** Label industri untuk laporan. */
  industry: string;
  /** Kenapa bisnis ini butuh otomasi/AI. */
  why: string;
  /** 1 = prioritas tertinggi. */
  priority: number;
}

/**
 * Vertikal target — bisnis yang jarang memakai AI/otomasi tetapi sangat
 * diuntungkan olehnya (booking, FAQ, follow-up, reminder yang repetitif).
 */
export const TARGET_VERTICALS: TargetVertical[] = [
  { niche: "klinik tumbuh kembang anak", industry: "Kesehatan", priority: 1, why: "Jadwal terapi berulang & banyak pertanyaan orang tua lewat chat." },
  { niche: "klinik kecantikan", industry: "Kesehatan", priority: 1, why: "Booking, reminder treatment, dan tanya-tanya harga sangat repetitif." },
  { niche: "klinik gigi", industry: "Kesehatan", priority: 2, why: "Reservasi & follow-up kontrol pasien masih manual." },
  { niche: "terapis anak / okupasi terapi", industry: "Kesehatan", priority: 2, why: "Penjadwalan sesi pasien dan komunikasi orang tua intensif." },
  { niche: "psikolog dan layanan konseling", industry: "Kesehatan", priority: 2, why: "Booking sesi dan screening awal lewat chat." },
  { niche: "apotek", industry: "Kesehatan", priority: 3, why: "Pertanyaan stok, resep, dan pesanan berulang via WhatsApp." },
  { niche: "klinik hewan", industry: "Hewan", priority: 2, why: "Booking vaksin/grooming dan reminder berkala." },
  { niche: "petshop", industry: "Hewan", priority: 3, why: "Pesanan & tanya stok produk berulang." },
  { niche: "salon dan barbershop", industry: "Gaya hidup", priority: 2, why: "Reservasi, reminder, dan tanya layanan/harga." },
  { niche: "laundry", industry: "Jasa", priority: 2, why: "Notifikasi status cucian & pengambilan masih manual." },
  { niche: "bengkel motor", industry: "Otomotif", priority: 3, why: "Booking servis & reminder berkala." },
  { niche: "katering", industry: "F&B", priority: 2, why: "Pesanan, konfirmasi menu, dan jadwal antar." },
  { niche: "toko kue dan bakery", industry: "F&B", priority: 3, why: "Pesanan custom & tanya harga lewat chat." },
  { niche: "kursus bahasa dan bimbel", industry: "Pendidikan", priority: 2, why: "Pendaftaran, jadwal kelas, dan tanya program." },
  { niche: "sekolah dan PAUD", industry: "Pendidikan", priority: 3, why: "Penerimaan siswa & komunikasi orang tua." },
  { niche: "wedding organizer", industry: "Event", priority: 2, why: "Alur tanya-jawab panjang & follow-up klien." },
  { niche: "agen properti", industry: "Properti", priority: 3, why: "Lead masuk banyak, follow-up manual melelahkan." },
  { niche: "travel umroh dan haji", industry: "Travel", priority: 2, why: "Volume pertanyaan paket & pendaftaran tinggi." },
  { niche: "studio foto", industry: "Kreatif", priority: 3, why: "Booking sesi & tanya paket berulang." },
  { niche: "gym dan yoga studio", industry: "Kebugaran", priority: 3, why: "Pendaftaran member & reminder jadwal kelas." },
  { niche: "butik dan fashion", industry: "Retail", priority: 3, why: "Tanya stok/ukuran & pesanan via chat." },
];

export interface ExcludedVertical {
  label: string;
  /** Kata kunci (lowercase). Cocok sebagai kata utuh / frasa. */
  keywords: string[];
}

/**
 * Vertikal yang DIKECUALIKAN — bisnis teknologi yang sudah akrab otomasi/AI.
 */
export const EXCLUDED_VERTICALS: ExcludedVertical[] = [
  { label: "Software house / pengembang aplikasi", keywords: ["software house", "software development", "software engineer", "pengembang aplikasi", "pengembangan aplikasi", "app developer", "web developer", "jasa pembuatan website", "jasa website", "jasa aplikasi", "coding", "programming", "programmer"] },
  { label: "Agensi digital & pemasaran", keywords: ["digital agency", "agensi digital", "digital marketing", "marketing agency", "agensi pemasaran", "social media agency", "social media marketing", "seo", "sem", "growth agency", "performance marketing"] },
  { label: "IT & konsultan teknologi", keywords: ["it consultant", "konsultan it", "it solution", "solusi it", "solusi teknologi", "system integrator", "integrasi sistem", "managed service", "ict", "teknologi informasi", "informatika"] },
  { label: "Startup & perusahaan teknologi", keywords: ["startup", "startup teknologi", "tech company", "perusahaan teknologi", "saas", "fintech", "platform digital", "e-commerce", "ecommerce", "marketplace"] },
  { label: "Infrastruktur, cloud & keamanan", keywords: ["data center", "hosting", "domain", "isp", "internet service provider", "cloud", "cyber security", "keamanan siber", "jaringan komputer", "network engineer"] },
  { label: "Kecerdasan buatan / otomasi", keywords: ["artificial intelligence", "machine learning", "deep learning", "kecerdasan buatan", "ai agency", "agensi ai", "automation agency", "rpa", "robotic process automation", "data scientist", "big data"] },
];

/** Domain yang jelas milik penyedia teknologi (website bisnis). */
const EXCLUDED_DOMAINS = ["github.io", "software", "digitalagency", "webdev", "itconsultant", "dev.io"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Cocokkan keyword sebagai kata utuh/frasa (bukan substring acak). */
function matchesKeyword(haystack: string, keyword: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`, "i");
  return pattern.test(haystack);
}

export interface ExcludeCheck {
  excluded: boolean;
  /** Label vertikal teknologi yang cocok (bila dikecualikan). */
  vertical?: string;
  /** Kata kunci yang memicu pengecualian. */
  match?: string;
}

/**
 * Tentukan apakah sebuah bisnis termasuk "bisnis teknologi" yang dikecualikan.
 * Memeriksa nama, kategori, dan (bila ada) domain website.
 */
export function checkExcludedBusiness(input: {
  name?: string | null;
  category?: string | null;
  website?: string | null;
}): ExcludeCheck {
  const haystack = `${input.name ?? ""} ${input.category ?? ""}`.toLowerCase().trim();

  for (const vertical of EXCLUDED_VERTICALS) {
    for (const keyword of vertical.keywords) {
      if (matchesKeyword(haystack, keyword)) {
        return { excluded: true, vertical: vertical.label, match: keyword };
      }
    }
  }

  if (input.website) {
    try {
      const host = new URL(input.website).hostname.toLowerCase();
      const domainHit = EXCLUDED_DOMAINS.find((domain) => host.includes(domain));
      if (domainHit) {
        return { excluded: true, vertical: "Domain teknologi", match: domainHit };
      }
    } catch {
      /* website bukan URL valid — abaikan */
    }
  }

  return { excluded: false };
}

/**
 * Pilih niche target (deterministik) berdasarkan prioritas.
 *
 * @param opts.count berapa niche yang diambil (default 3)
 * @param opts.only  batasi ke niche tertentu (nama persis dari katalog)
 */
export function pickTargetVertical(opts: { count?: number; only?: string[] } = {}): TargetVertical[] {
  const count = opts.count ?? 3;
  const pool = opts.only?.length
    ? TARGET_VERTICALS.filter((vertical) => opts.only!.includes(vertical.niche))
    : TARGET_VERTICALS;
  return [...pool].sort((a, b) => a.priority - b.priority).slice(0, Math.max(0, count));
}

/** Ringkasan katalog untuk API/dokumentasi. */
export function targetingCatalog() {
  return {
    verticals: [...TARGET_VERTICALS].sort((a, b) => a.priority - b.priority),
    excluded: EXCLUDED_VERTICALS,
  };
}
