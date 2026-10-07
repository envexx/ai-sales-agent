import { resolve } from "node:path";
import { env } from "../../config/env.js";
import { loggerFor } from "../../config/logger.js";
import { traceEntry } from "../../graph/nodes/helpers.js";
import { camoufoxFetch } from "../../integrations/camoufox.js";
import { firecrawlScrape } from "../../integrations/firecrawl.js";
import { discover } from "../search.js";
import type { ResearchStateType, ResearchUpdateType } from "../state.js";
import type { IngestEngine, ResearchBrief, SearchHit, SourceDoc } from "../types.js";
import { dedupeBy, domainOf, mapLimit, normalizeUrl, pruneText, stripHtml } from "../util.js";
import { evidenceName, writeTextFile } from "../workspace.js";

const log = loggerFor("research:ingest");

/** Cocokkan host dengan aturan include/exclude domain pada brief. */
function domainMatches(host: string, rule: string): boolean {
  const clean = rule.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  return host === clean || host.endsWith(`.${clean}`);
}

function allowedDomain(url: string, brief: ResearchBrief): boolean {
  const host = domainOf(url).toLowerCase();
  if (!host) return false;
  if (brief.excludeDomains.some((rule) => domainMatches(host, rule))) return false;
  if (brief.includeDomains.length > 0) {
    return brief.includeDomains.some((rule) => domainMatches(host, rule));
  }
  return true;
}

/** Simpan isi sumber sebagai evidence dan bangun SourceDoc. */
async function persistSource(params: {
  id: number;
  url: string;
  title: string;
  engine: IngestEngine;
  content: string;
  html: string;
  dir: string;
}): Promise<SourceDoc> {
  const file = evidenceName(params.id, params.title || params.url, "md");
  await writeTextFile(params.dir, file, params.content);
  if (params.html) {
    await writeTextFile(params.dir, evidenceName(params.id, params.title || params.url, "html"), params.html);
  }
  return {
    id: params.id,
    url: params.url,
    title: params.title || params.url,
    engine: params.engine,
    fetchedAt: new Date().toISOString(),
    chars: params.content.length,
    file,
    content: pruneText(params.content, env.RESEARCH_PER_SOURCE_CHARS),
  };
}

/** Baca satu URL dengan dual-engine: Firecrawl dulu, Camoufox sebagai fallback. */
async function fetchHit(hit: SearchHit, id: number, dir: string): Promise<SourceDoc | null> {
  const url = normalizeUrl(hit.url);

  const fc = await firecrawlScrape(url);
  if (fc && (fc.markdown || fc.html)) {
    return persistSource({
      id,
      url: fc.url || url,
      title: fc.title || hit.title || url,
      engine: "firecrawl",
      content: fc.markdown || stripHtml(fc.html),
      html: fc.html,
      dir,
    });
  }

  const cf = await camoufoxFetch(url, { screenshotDir: resolve(dir, "evidence") });
  if (cf && (cf.text || cf.html)) {
    return persistSource({
      id,
      url,
      title: cf.title || hit.title || url,
      engine: "camoufox",
      content: cf.text || stripHtml(cf.html),
      html: cf.html,
      dir,
    });
  }

  return null;
}

/**
 * Node 2 — Dual-Engine Ingestion.
 *
 * Discovery via Firecrawl search (+ seed URLs), lalu ambil tiap halaman dengan
 * Firecrawl dan fallback Camoufox untuk halaman berat JS / anti-bot.
 */
export async function ingestNode(
  state: ResearchStateType,
): Promise<ResearchUpdateType> {
  const brief = state.brief;
  if (!brief) return { errors: ["ingest: brief kosong"] };

  const startedAt = Date.parse(state.startedAt || "") || Date.now();
  if (Date.now() - startedAt > brief.timeBudgetMs) {
    return { trace: [traceEntry("ingest", { skipped: "time budget habis" })] };
  }

  const capacity = brief.maxSources - state.sources.length;
  if (capacity <= 0) {
    return { trace: [traceEntry("ingest", { skipped: "maxSources tercapai" })] };
  }

  const known = new Set(state.sources.map((s) => normalizeUrl(s.url)));

  const seedHits: SearchHit[] =
    state.iteration <= 1
      ? brief.seedUrls.map((url) => ({ url, title: url, description: "seed", query: "seed" }))
      : [];

  const queries = [
    ...new Set(state.plan.flatMap((task) => task.queries).map((q) => q.trim()).filter(Boolean)),
  ].slice(0, 6);

  const batches = await mapLimit(queries, 2, async (query) => discover(query, { limit: 4 }));

  const discovered = dedupeBy([...seedHits, ...batches.flat()], (h) => normalizeUrl(h.url));
  const candidates = discovered
    .filter((h) => !known.has(normalizeUrl(h.url)))
    .filter((h) => allowedDomain(h.url, brief))
    .slice(0, capacity);

  const baseId = state.sources.length;
  const fetched = await mapLimit(candidates, env.RESEARCH_CONCURRENCY, async (hit, index) => {
    try {
      return await fetchHit(hit, baseId + index + 1, state.workspaceDir);
    } catch (err) {
      log.warn({ url: hit.url, err: (err as Error).message }, "ingest gagal");
      return null;
    }
  });

  const sources = fetched.filter((s): s is SourceDoc => s !== null);
  const failed = fetched.length - sources.length;
  const firecrawlCount = sources.filter((s) => s.engine === "firecrawl").length;
  const camoufoxCount = sources.filter((s) => s.engine === "camoufox").length;

  return {
    // Hanya kirim channel append saat ada isi, agar tidak mereset log sebelumnya.
    ...(sources.length ? { sources } : {}),
    ...(discovered.length ? { searchResults: discovered } : {}),
    usage: {
      ...state.usage,
      searches: state.usage.searches + queries.length,
      fetched: state.usage.fetched + sources.length,
      firecrawl: state.usage.firecrawl + firecrawlCount,
      camoufox: state.usage.camoufox + camoufoxCount,
      failed: state.usage.failed + failed,
    },
    trace: [
      traceEntry("ingest", {
        queries: queries.length,
        candidates: candidates.length,
        fetched: sources.length,
        firecrawl: firecrawlCount,
        camoufox: camoufoxCount,
        failed,
      }),
    ],
  };
}
