import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { ghAuthStatus, ghAvailable } from "./github.js";
import { r2Configured } from "./cloudflareR2.js";

const log = loggerFor("integrations:devplatforms");

/**
 * Katalog & aksi **platform developer** yang dipakai agent Developer (D4).
 *
 * Setiap platform aktif hanya bila kredensialnya ada di `.env` — ini menjaga
 * sistem tetap jalan tanpa memaksa semua integrasi terpasang. Aksi memakai
 * REST API sederhana (token/API key) agar tidak menambah dependensi.
 */

export interface PlatformStatus {
  id: "github" | "vercel" | "cloudflare" | "supabase" | "search_console" | "analytics";
  name: string;
  configured: boolean;
  detail: string;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Status kesiapan tiap platform (untuk UI & keputusan agent). */
export async function developerPlatforms(): Promise<PlatformStatus[]> {
  let github: PlatformStatus;
  if (await ghAvailable()) {
    const auth = await ghAuthStatus();
    github = {
      id: "github",
      name: "GitHub",
      configured: auth.ok,
      detail: auth.ok ? `gh login${auth.login ? `: ${auth.login}` : ""}` : "gh belum login",
    };
  } else {
    github = { id: "github", name: "GitHub", configured: false, detail: "gh CLI tidak ditemukan" };
  }

  return [
    github,
    {
      id: "vercel",
      name: "Vercel",
      configured: Boolean(env.VERCEL_TOKEN || env.VERCEL_DEPLOY_HOOK_URL),
      detail: env.VERCEL_TOKEN ? "token terpasang" : env.VERCEL_DEPLOY_HOOK_URL ? "deploy hook terpasang" : "belum dikonfigurasi",
    },
    {
      id: "cloudflare",
      name: "Cloudflare",
      configured: Boolean(env.CLOUDFLARE_API_TOKEN) || r2Configured(),
      detail: [
        env.CLOUDFLARE_API_TOKEN ? "API token ✓" : "API token ✗",
        r2Configured() ? `R2/S3 ✓ (bucket: ${env.CLOUDFLARE_R2_BUCKET})` : "R2/S3 ✗",
      ].join(" · "),
    },
    {
      id: "supabase",
      name: "Supabase",
      configured: Boolean(env.SUPABASE_ACCESS_TOKEN),
      detail: env.SUPABASE_ACCESS_TOKEN ? "access token terpasang" : "belum dikonfigurasi",
    },
    {
      id: "search_console",
      name: "Google Search Console",
      configured: Boolean(env.SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON),
      detail: env.SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON
        ? "service account terpasang (OAuth dijalankan saat aksi)"
        : "belum dikonfigurasi — SEO masih bersifat saran",
    },
    {
      id: "analytics",
      name: "Analytics",
      configured: Boolean(env.PLAUSIBLE_API_TOKEN && env.PLAUSIBLE_SITE_ID),
      detail: env.PLAUSIBLE_API_TOKEN ? "Plausible terpasang" : "belum dikonfigurasi",
    },
  ];
}

/* ───────────────────────────── Cloudflare ─────────────────────────── */

export async function cloudflareListZones(): Promise<Array<{ id: string; name: string }>> {
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN belum diisi");
  const data = await fetchJson<{ result: Array<{ id: string; name: string }> }>(
    "https://api.cloudflare.com/client/v4/zones",
    { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } },
  );
  return data.result ?? [];
}

export async function cloudflarePurgeCache(zoneId: string): Promise<void> {
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN belum diisi");
  await fetchJson(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ purge_everything: true }),
  });
}

/** Daftar bucket R2 (butuh API token + account id). */
export async function cloudflareListR2Buckets(): Promise<
  Array<{ name: string; creation_date?: string }>
> {
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN belum diisi");
  if (!env.CLOUDFLARE_ACCOUNT_ID) throw new Error("CLOUDFLARE_ACCOUNT_ID belum diisi");
  const data = await fetchJson<{
    result: { buckets: Array<{ name: string; creation_date?: string }> };
  }>(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets`, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  });
  return data.result?.buckets ?? [];
}

/* ───────────────────────────── Supabase ───────────────────────────── */

export async function supabaseListProjects(): Promise<Array<{ id: string; name: string; region: string }>> {
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN belum diisi");
  return fetchJson<Array<{ id: string; name: string; region: string }>>(
    "https://api.supabase.com/v1/projects",
    { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } },
  );
}

/* ────────────────────────────── Vercel ────────────────────────────── */

export async function vercelListProjects(): Promise<Array<{ id: string; name: string }>> {
  if (!env.VERCEL_TOKEN) throw new Error("VERCEL_TOKEN belum diisi");
  const data = await fetchJson<{ projects: Array<{ id: string; name: string }> }>(
    "https://api.vercel.com/v9/projects",
    { headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` } },
  );
  return data.projects ?? [];
}

/** Picu deploy lewat Deploy Hook (paling sederhana & aman). */
export async function vercelTriggerDeploy(hookUrl?: string): Promise<{ triggered: boolean; hook: string | null }> {
  const hook = hookUrl ?? env.VERCEL_DEPLOY_HOOK_URL;
  if (!hook) return { triggered: false, hook: null };
  await fetchJson(hook, { method: "POST" });
  return { triggered: true, hook };
}

/* ───────────────────────────── Analytics ──────────────────────────── */

export interface AnalyticsOverview {
  visitors: number;
  pageviews: number;
  bounceRate: number;
  period: string;
}

/** Statistik ringkas Plausible (30 hari terakhir). */
export async function plausibleStats(siteId?: string): Promise<AnalyticsOverview> {
  const site = siteId ?? env.PLAUSIBLE_SITE_ID;
  if (!env.PLAUSIBLE_API_TOKEN || !site) throw new Error("PLAUSIBLE_API_TOKEN / PLAUSIBLE_SITE_ID belum diisi");
  const params = new URLSearchParams({
    site_id: site,
    period: "30d",
    metrics: "visitors,pageviews,bounce_rate",
  });
  const data = await fetchJson<{ results: Record<string, number> }>(
    `https://plausible.io/api/v1/stats/aggregate?${params.toString()}`,
    { headers: { Authorization: `Bearer ${env.PLAUSIBLE_API_TOKEN}` } },
  );
  const r = data.results ?? {};
  return {
    visitors: r.visitors ?? 0,
    pageviews: r.pageviews ?? 0,
    bounceRate: r.bounce_rate ?? 0,
    period: "30d",
  };
}

/* ────────────────────────── Search Console ────────────────────────── */

/**
 * Search Console butuh OAuth service account. Bila belum dikonfigurasi,
 * kembalikan status agar agent Developer menyajikan SEO sebagai *saran*.
 */
export function searchConsoleStatus(): { configured: boolean; siteUrl: string | null; note: string } {
  const configured = Boolean(env.SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON);
  return {
    configured,
    siteUrl: env.SEARCH_CONSOLE_SITE_URL || null,
    note: configured
      ? "Service account terpasang; submit sitemap/inspeksi memerlukan scope webmasters."
      : "Belum dikonfigurasi. Audit SEO berjalan sebagai saran (tanpa data indexing).",
  };
}

/** Pemanggilan platform dengan pengaman (dipakai agent tanpa menggagalkan alur). */
export async function safePlatform<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    log.warn({ platform: label, err: (err as Error).message }, "panggilan platform gagal");
    return null;
  }
}
