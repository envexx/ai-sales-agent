import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("integration:firecrawl");
const DEFAULT_TIMEOUT_MS = 45_000;

function endpoint(path: string): string {
  return `${env.FIRECRAWL_BASE_URL.replace(/\/$/, "")}${path}`;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (env.FIRECRAWL_API_KEY) h.authorization = `Bearer ${env.FIRECRAWL_API_KEY}`;
  return h;
}

async function request<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T | null> {
  if (!env.FIRECRAWL_ENABLED) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint(path), {
      ...init,
      headers: headers(),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn({ path, status: res.status }, "firecrawl request failed");
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    log.warn({ path, err: (err as Error).message }, "firecrawl request error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────────── scrape ─────────────────────────────── */

export interface FirecrawlScrapedPage {
  url: string;
  title: string;
  markdown: string;
  html: string;
  statusCode: number | null;
}

interface ScrapeResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    html?: string;
    metadata?: {
      title?: string;
      sourceURL?: string;
      url?: string;
      statusCode?: number;
    };
  };
}

export async function firecrawlScrape(
  url: string,
  opts: {
    timeoutMs?: number;
    /** Default true. Set false untuk halaman hasil pencarian. */
    onlyMainContent?: boolean;
    /** Format yang diminta; default markdown + html. */
    formats?: string[];
    /** Tunggu (ms) agar konten JS termuat. */
    waitForMs?: number;
  } = {},
): Promise<FirecrawlScrapedPage | null> {
  const res = await request<ScrapeResponse>(
    "/v1/scrape",
    {
      method: "POST",
      body: JSON.stringify({
        url,
        formats: opts.formats ?? ["markdown", "html"],
        onlyMainContent: opts.onlyMainContent ?? true,
        ...(opts.waitForMs ? { waitFor: opts.waitForMs } : {}),
      }),
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const data = res?.data;
  if (!res?.success || !data) return null;

  const markdown = (data.markdown ?? "").trim();
  const html = data.html ?? "";
  if (!markdown && !html) return null;

  return {
    url: data.metadata?.sourceURL ?? data.metadata?.url ?? url,
    title: data.metadata?.title?.trim() || url,
    markdown,
    html,
    statusCode: data.metadata?.statusCode ?? null,
  };
}

/* ─────────────────────────────── search ─────────────────────────────── */

export interface FirecrawlSearchResult {
  url: string;
  title: string;
  description: string;
}

interface SearchResponse {
  success?: boolean;
  data?: unknown;
}

interface RawSearchItem {
  url?: string;
  title?: string;
  description?: string;
}

/** Firecrawl mengembalikan `data` sebagai array (atau `{ web, news }`). */
function searchItems(data: unknown): RawSearchItem[] {
  if (Array.isArray(data)) return data as RawSearchItem[];
  const grouped = data as { web?: RawSearchItem[]; news?: RawSearchItem[] } | undefined;
  return [...(grouped?.web ?? []), ...(grouped?.news ?? [])];
}

export async function firecrawlSearch(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<FirecrawlSearchResult[]> {
  const res = await request<SearchResponse>(
    "/v1/search",
    { method: "POST", body: JSON.stringify({ query, limit: opts.limit ?? 5 }) },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!res?.success) return [];

  return searchItems(res.data)
    .filter((item): item is RawSearchItem & { url: string } => typeof item.url === "string")
    .map((item) => ({
      url: item.url,
      title: (item.title ?? "").trim(),
      description: (item.description ?? "").trim(),
    }));
}

/* ───────────────────────────── availability ─────────────────────────── */

export async function firecrawlAvailable(timeoutMs = 5_000): Promise<boolean> {
  if (!env.FIRECRAWL_ENABLED) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint("/"), { headers: headers(), signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
