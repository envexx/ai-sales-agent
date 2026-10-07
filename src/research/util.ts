/** Utilitas kecil yang dipakai engine riset (URL, teks, concurrency). */

/** Jalankan `fn` untuk tiap item dengan batas konkurensi. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const size = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!, index);
    }
  };

  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

/** Normalisasi URL: buang hash & parameter tracking, rapikan trailing slash. */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    const out = url.toString();
    return out.endsWith("/") ? out.slice(0, -1) : out;
  } catch {
    return raw.trim();
  }
}

export function domainOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function slugify(text: string, max = 60): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .slice(0, max)
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

/** Pangkas konteks: rapikan whitespace, buang baris boilerplate, batasi panjang. */
export function pruneText(input: string, maxChars: number): string {
  const cleaned = input
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .filter((line) => line.trim().length !== 1)
    .join("\n")
    .trim();

  if (cleaned.length <= maxChars) return cleaned;

  const head = cleaned.slice(0, Math.floor(maxChars * 0.7));
  const tail = cleaned.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n[… konten dipangkas …]\n\n${tail}`;
}

/** Buang duplikat berdasarkan key. */
export function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/** Ubah HTML menjadi teks polos (fallback bila markdown kosong). */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
