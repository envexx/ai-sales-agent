import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { camoufoxFetch } from "../integrations/camoufox.js";
import { firecrawlScrape, firecrawlSearch } from "../integrations/firecrawl.js";
import { tavilyConfigured, tavilySearch } from "../integrations/tavily.js";
import type { SearchHit } from "./types.js";
import { dedupeBy, domainOf, normalizeUrl } from "./util.js";

const log = loggerFor("research:search");

/* Domain spam yang tidak pernah menjadi sumber riset yang layak. */
const JUNK_HOSTS = [
  "xnxx.com",
  "pornhub.com",
  "xvideos.com",
  "xhamster.com",
  "redtube.com",
  "onlyfans.com",
  "fansporno.com",
  "viralxxxporn.com",
];

function isUsableUrl(raw: string): boolean {
  if (!/^https?:\/\//i.test(raw)) return false;
  const host = domainOf(raw).toLowerCase();
  if (!host) return false;
  if (host.endsWith("bing.com") || host.endsWith("duckduckgo.com")) return false;
  if (JUNK_HOSTS.some((junk) => host === junk || host.endsWith(`.${junk}`))) return false;
  return true;
}

/* ───────────────────────── Bing HTML parsing ───────────────────────── */

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bing membungkus URL hasil dalam `bing.com/ck/a?...&u=a1<base64url>`. */
function decodeBingUrl(raw: string): string | null {
  const href = raw.replace(/&amp;/g, "&");
  try {
    const url = new URL(href);
    const target = url.searchParams.get("u");
    if (target?.startsWith("a1")) {
      const b64 = target.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      const decoded = Buffer.from(padded, "base64").toString("utf8");
      return /^https?:\/\//i.test(decoded) ? decoded : null;
    }
    if (/^https?:\/\//i.test(href) && !href.includes("bing.com/ck/a")) return href;
  } catch {
    /* ignore */
  }
  return null;
}

interface RawResult {
  url: string;
  title: string;
}

function parseBingHtml(html: string): RawResult[] {
  const out: RawResult[] = [];
  const re = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const target = decodeBingUrl(match[1] ?? "");
    if (!target) continue;
    out.push({ url: target, title: stripTags(match[2] ?? "") });
  }
  return out;
}

function bingUrl(query: string, limit: number): string {
  const count = Math.max(limit, 10);
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${count}&setlang=en`;
}

/* ───────────────────────────── providers ───────────────────────────── */

interface SearxngResponse {
  results?: Array<{ url?: string; title?: string; content?: string }>;
}

/** SearXNG JSON API (via proxy). Ini sumber discovery paling andal. */
async function searxngSearch(query: string, limit: number): Promise<RawResult[]> {
  const base = env.RESEARCH_SEARXNG_URL.replace(/\/$/, "");
  const url = `${base}/search?q=${encodeURIComponent(query)}&format=json&language=en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as SearxngResponse;
    return (data.results ?? [])
      .filter((r): r is { url: string; title?: string } => typeof r.url === "string")
      .slice(0, limit * 2)
      .map((r) => ({ url: r.url, title: (r.title ?? "").trim() }));
  } catch (err) {
    log.warn({ err: (err as Error).message }, "searxng request error");
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function bingViaFirecrawl(query: string, limit: number): Promise<RawResult[]> {
  const page = await firecrawlScrape(bingUrl(query, limit), {
    formats: ["html"],
    onlyMainContent: false,
  });
  return page?.html ? parseBingHtml(page.html) : [];
}

async function bingViaCamoufox(query: string, limit: number): Promise<RawResult[]> {
  const page = await camoufoxFetch(bingUrl(query, limit));
  return page?.html ? parseBingHtml(page.html) : [];
}

/** Tavily Search API — discovery untuk AI agent (butuh TAVILY_API_KEY). */
async function tavilyRaw(query: string, limit: number): Promise<RawResult[]> {
  if (!tavilyConfigured()) return [];
  const hits = await tavilySearch(query, { limit });
  return hits.map((hit) => ({ url: hit.url, title: hit.title }));
}

/* ────────────────────────────── discovery ──────────────────────────── */

/**
 * Discovery URL untuk satu query.
 *
 * Provider dipilih lewat `RESEARCH_SEARCH_PROVIDER`:
 * - `auto` (default): Tavily (bila aktif) → SearXNG → Bing (Firecrawl) → Bing (Camoufox) → Firecrawl search
 * - `tavily`: Tavily Search API (`TAVILY_API_KEY`)
 * - `searxng`: SearXNG JSON API (`RESEARCH_SEARXNG_URL`)
 * - `bing`: Bing (Firecrawl, fallback Camoufox)
 * - `camoufox`: Bing via browser stealth
 * - `firecrawl`: endpoint /v1/search Firecrawl
 * - `none`: tanpa discovery (hanya seed URL)
 */
export async function discover(query: string, opts: { limit?: number } = {}): Promise<SearchHit[]> {
  const provider = env.RESEARCH_SEARCH_PROVIDER;
  const limit = opts.limit ?? 5;
  if (provider === "none") return [];

  let raw: RawResult[] = [];

  if (provider === "tavily") {
    raw = await tavilyRaw(query, limit);
  } else if (provider === "searxng") {
    raw = await searxngSearch(query, limit);
  } else if (provider === "firecrawl") {
    raw = await firecrawlSearch(query, { limit });
  } else if (provider === "bing") {
    raw = await bingViaFirecrawl(query, limit);
    if (raw.length === 0) raw = await bingViaCamoufox(query, limit);
  } else if (provider === "camoufox") {
    raw = await bingViaCamoufox(query, limit);
  } else {
    // auto: coba berurutan sampai ada hasil.
    raw = await tavilyRaw(query, limit);
    if (raw.length === 0) raw = await searxngSearch(query, limit);
    if (raw.length === 0) raw = await bingViaFirecrawl(query, limit);
    if (raw.length === 0) raw = await bingViaCamoufox(query, limit);
    if (raw.length === 0) {
      raw = await firecrawlSearch(query, { limit }).then((hits) =>
        hits.map((h) => ({ url: h.url, title: h.title })),
      );
    }
  }

  const usable = dedupeBy(
    raw.filter((r) => isUsableUrl(r.url)),
    (r) => normalizeUrl(r.url),
  ).slice(0, limit);

  log.debug({ query, provider, results: usable.length }, "discovery");
  return usable.map((r) => ({
    url: r.url,
    title: r.title || r.url,
    description: "",
    query,
  }));
}
