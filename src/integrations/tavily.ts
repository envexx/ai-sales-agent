import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("integration:tavily");
const DEFAULT_TIMEOUT_MS = 30_000;

function endpoint(path: string): string {
  return `${env.TAVILY_BASE_URL.replace(/\/$/, "")}${path}`;
}

function enabled(): boolean {
  return env.TAVILY_ENABLED && Boolean(env.TAVILY_API_KEY);
}

/** Domain whitelist/blacklist dari string dipisah koma. */
function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Tavily memakai `api_key` di body (metode lama) atau `Authorization: Bearer`
 * (metode baru). Kami kirim keduanya agar kompatibel dengan kedua versi API.
 */
function authHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${env.TAVILY_API_KEY}`,
  };
}

async function request<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<T | null> {
  if (!enabled()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint(path), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ api_key: env.TAVILY_API_KEY, ...body }),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn({ path, status: res.status }, "tavily request failed");
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    log.warn({ path, err: (err as Error).message }, "tavily request error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────────── search ─────────────────────────────── */

export interface TavilySearchResult {
  url: string;
  title: string;
  /** Cuplikan/potongan konten paling relevan dari hasil. */
  content: string;
  score: number | null;
  /** Isi halaman penuh (bila diminta lewat `includeRawContent`). */
  rawContent: string | null;
}

interface SearchResponse {
  results?: Array<{
    url?: string;
    title?: string;
    content?: string;
    score?: number;
    raw_content?: string | null;
  }>;
}

/**
 * Tavily Search — discovery untuk AI agent.
 *
 * Dokumentasi: https://docs.tavily.com/documentation/api-reference/endpoint/search
 */
export async function tavilySearch(
  query: string,
  opts: {
    limit?: number;
    searchDepth?: "basic" | "advanced";
    includeDomains?: string[];
    excludeDomains?: string[];
    includeRawContent?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<TavilySearchResult[]> {
  const includeDomains = opts.includeDomains ?? splitList(env.TAVILY_INCLUDE_DOMAINS);
  const excludeDomains = opts.excludeDomains ?? splitList(env.TAVILY_EXCLUDE_DOMAINS);

  const res = await request<SearchResponse>(
    "/search",
    {
      query,
      max_results: opts.limit ?? env.TAVILY_MAX_RESULTS,
      search_depth: opts.searchDepth ?? env.TAVILY_SEARCH_DEPTH,
      include_answer: false,
      include_raw_content: opts.includeRawContent ?? env.TAVILY_INCLUDE_RAW_CONTENT,
      ...(includeDomains.length ? { include_domains: includeDomains } : {}),
      ...(excludeDomains.length ? { exclude_domains: excludeDomains } : {}),
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  if (!res?.results) return [];
  return res.results
    .filter((item): item is typeof item & { url: string } => typeof item.url === "string")
    .map((item) => ({
      url: item.url,
      title: (item.title ?? "").trim(),
      content: (item.content ?? "").trim(),
      score: typeof item.score === "number" ? item.score : null,
      rawContent: item.raw_content ? String(item.raw_content) : null,
    }));
}

/* ─────────────────────────────── extract ────────────────────────────── */

export interface TavilyExtractResult {
  url: string;
  rawContent: string;
}

interface ExtractResponse {
  results?: Array<{ url?: string; raw_content?: string | null }>;
}

/**
 * Tavily Extract — ambil isi halaman sebagai teks bersih.
 *
 * Dokumentasi: https://docs.tavily.com/documentation/api-reference/endpoint/extract
 */
export async function tavilyExtract(
  urls: string[],
  opts: { extractDepth?: "basic" | "advanced"; timeoutMs?: number } = {},
): Promise<TavilyExtractResult[]> {
  if (urls.length === 0) return [];
  const res = await request<ExtractResponse>(
    "/extract",
    {
      urls,
      extract_depth: opts.extractDepth ?? env.TAVILY_EXTRACT_DEPTH,
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  if (!res?.results) return [];
  return res.results
    .filter(
      (item): item is { url: string; raw_content?: string | null } =>
        typeof item.url === "string",
    )
    .map((item) => ({ url: item.url, rawContent: (item.raw_content ?? "").trim() }));
}

/* ───────────────────────────── availability ─────────────────────────── */

/** Apakah Tavily dikonfigurasi (enabled + ada API key). */
export function tavilyConfigured(): boolean {
  return enabled();
}
