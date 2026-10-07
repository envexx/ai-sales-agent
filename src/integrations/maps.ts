import { loggerFor } from "../config/logger.js";
import { firecrawlScrape } from "./firecrawl.js";

const log = loggerFor("integration:maps");

export interface MapsPlace {
  name: string;
  rating: number | null;
  reviews: number | null;
  category: string | null;
}

/** Angka format Indonesia: "4,9" → 4.9 ; "4.159" → 4159. */
function parseNumber(raw: string): number | null {
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Decode entitas HTML dasar + rapikan spasi. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => HTML_ENTITIES[match] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rapikan nama hasil Maps. Google kadang mengembalikan label gabungan seperti
 * "Nama (Nama) | Kategori" — buang anotasi pengulangan & kategori.
 */
function cleanName(raw: string): string {
  let name = decodeEntities(raw);
  const beforePipe = name.split("|")[0]?.trim();
  if (beforePipe) name = beforePipe;
  const paren = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (paren?.[1]) name = paren[1].trim();
  return name.replace(/[\s·|,-]+$/g, "").trim();
}

/**
 * Parse hasil pencarian Google Maps dari HTML.
 *
 * Google menandai tiap kartu dengan `role="article"`, berisi tombol
 * `class="hfpxzc"` dengan `aria-label` = nama bisnis, dan label rating
 * "4,9 bintang 534 Ulasan".
 */
function parsePlaces(html: string): MapsPlace[] {
  const blocks = html.split('role="article"').slice(1);
  const places: MapsPlace[] = [];

  for (const block of blocks) {
    // Ambil aria-label dari tag yang memuat class "hfpxzc" (urutan atribut bebas).
    const anchorTag = block.match(/<[^>]*\bhfpxzc\b[^>]*>/)?.[0];
    const rawName =
      anchorTag?.match(/aria-label="([^"]+)"/)?.[1] ??
      block.match(/aria-label="([^"]+)"/)?.[1];
    if (!rawName) continue;
    const name = cleanName(rawName);
    if (!name) continue;

    const ratingMatch = block.match(/aria-label="([\d.,]+) bintang ([\d.,]+) Ulasan"/);
    const categoryRaw = block.match(/<span[^>]*>([^<]{3,60})<\/span>/)?.[1];
    // Hindari menangkap angka rating sebagai kategori.
    const category =
      categoryRaw && !/^[\d.,\s]+$/.test(categoryRaw) ? decodeEntities(categoryRaw) : null;

    places.push({
      name,
      rating: ratingMatch?.[1] ? parseNumber(ratingMatch[1]) : null,
      reviews: ratingMatch?.[2] ? parseNumber(ratingMatch[2]) : null,
      category,
    });
  }

  return places;
}

/**
 * Cari bisnis di Google Maps via scraping (Firecrawl + Playwright).
 *
 * Catatan: halaman hanya memuat sebagian kecil kartu (lazy-load), jadi
 * `limit` di sini adalah batas atas, bukan jaminan jumlah.
 */
export async function mapsSearch(params: {
  query: string;
  location?: string;
  limit?: number;
  waitForMs?: number;
}): Promise<MapsPlace[]> {
  const q = [params.query, params.location].filter(Boolean).join(" ").trim();
  const url = `https://www.google.com/maps/search/${encodeURIComponent(q)}/?hl=id`;

  const page = await firecrawlScrape(url, {
    formats: ["html"],
    onlyMainContent: false,
    waitForMs: params.waitForMs ?? 6000,
  });

  if (!page?.html) {
    log.warn({ q }, "scrape Google Maps gagal/kosong");
    return [];
  }

  const places = parsePlaces(page.html);
  log.info({ q, found: places.length }, "maps search");
  return places.slice(0, params.limit ?? 10);
}
