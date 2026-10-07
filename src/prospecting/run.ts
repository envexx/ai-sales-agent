import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { firecrawlScrape } from "../integrations/firecrawl.js";
import { mapsSearch } from "../integrations/maps.js";
import { tavilyConfigured, tavilyExtract, tavilySearch } from "../integrations/tavily.js";
import { structuredInvoke } from "../llm/index.js";
import { emitEvent } from "../pipeline/events.js";
import { enqueueJob } from "../pipeline/repository.js";
import { upsertProspect, updateLead, countProspectsSince, getLeadByJid, findProspectByBusiness } from "../repository/index.js";
import { discover } from "../research/search.js";
import { domainOf, slugify } from "../research/util.js";
import { normalizeJid } from "../whatsapp/index.js";
import { checkExcludedBusiness, pickTargetVertical } from "./targeting.js";
import type {
  ProspectBrief,
  ProspectCard,
  ProspectProgress,
  ProspectProgressCallback,
  ProspectRunResult,
} from "./types.js";

const log = loggerFor("prospecting");

/* ───────────────────────── enrichment ────────────────────────────── */

const ContactSchema = z.object({
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  address: z.string().nullable(),
});

const DIRECTORY_HOSTS = [
  "google.com",
  "goo.gl",
  "maps.app.goo.gl",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "tokopedia.com",
  "shopee.co.id",
  "bukalapak.com",
  "lazada.co.id",
  "yelp.com",
  "tripadvisor.com",
  "foursquare.com",
  // Peta & tautan agregator (bukan situs resmi bisnis).
  "waze.com",
  "linktr.ee",
  "bit.ly",
  "s.id",
  "linkin.bio",
  // Direktori kesehatan (bukan situs resmi klinik).
  "hellosehat.com",
  "alodokter.com",
  "halodoc.com",
  "pratiko.id",
  "autismconnect.com",
  "klinikpintar.id",
  "yellowpages.co.id",
  "yellowpages.com",
  "lewatmana.com",
  "mymeditravel.com",
  "indonesiaknowledge.com",
  "sehatq.com",
  "dokter.id",
  "k24klik.com",
];

function isBusinessSite(url: string): boolean {
  const host = domainOf(url).toLowerCase();
  return Boolean(host) && !DIRECTORY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Cari situs resmi bisnis lewat pencarian, lalu ambil kontaknya. */
async function enrichPlace(
  name: string,
  location: string,
): Promise<{ phone: string | null; website: string | null; email: string | null; address: string | null; evidence: string }> {
  const hits = await discover(`${name} ${location}`.trim(), { limit: 6 });
  let siteUrl = hits.find((hit) => isBusinessSite(hit.url))?.url ?? null;

  // Fungsi tambahan (Tavily): bila discovery utama tidak menemukan situs resmi.
  if (!siteUrl && tavilyConfigured()) {
    try {
      const tavilyHits = await tavilySearch(`${name} ${location}`.trim(), { limit: 6 });
      siteUrl = tavilyHits.find((hit) => isBusinessSite(hit.url))?.url ?? null;
    } catch (err) {
      log.warn({ name, err: (err as Error).message }, "tavily site lookup gagal");
    }
  }

  const website = siteUrl;
  let evidence = "";
  let phone: string | null = null;
  let email: string | null = null;
  let address: string | null = null;

  if (siteUrl) {
    let content = "";
    try {
      const page = await firecrawlScrape(siteUrl, { onlyMainContent: false });
      content = (page?.markdown ?? "").trim();
    } catch (err) {
      log.warn({ name, err: (err as Error).message }, "firecrawl scrape gagal");
    }

    // Fungsi tambahan (Tavily): ekstraksi konten bila scrape kosong/gagal.
    if (content.length < 100 && tavilyConfigured()) {
      try {
        const extracted = await tavilyExtract([siteUrl]);
        const raw = extracted[0]?.rawContent ?? "";
        if (raw.length > content.length) content = raw;
      } catch (err) {
        log.warn({ name, err: (err as Error).message }, "tavily extract gagal");
      }
    }

    evidence = content.slice(0, 8000);
    if (evidence.length > 100) {
      try {
        const contact = await structuredInvoke({
          schema: ContactSchema,
          system:
            "Kamu mengekstrak data kontak bisnis dari isi halaman web. Kembalikan hanya data yang benar-benar ada di teks. Untuk 'whatsapp', hanya isi bila nomor jelas untuk WhatsApp.",
          human: `Nama bisnis: ${name}\nLokasi: ${location}\n\nIsi halaman:\n"""${evidence}"""`,
          name: "ProspectEnrichment",
          temperature: 0,
        });
        phone = contact.phone ?? contact.whatsapp ?? null;
        email = contact.email ?? null;
        address = contact.address ?? null;
      } catch (err) {
        log.warn({ name, err: (err as Error).message }, "enrichment LLM gagal");
      }
    }
  }

  return { phone, website, email, address, evidence };
}

/** Normalisasi nomor HP Indonesia (08xx / +628xx / 628xx). */
function normalizeMobile(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d]/g, "");
  const withCountry = cleaned.startsWith("0") ? `62${cleaned.slice(1)}` : cleaned;
  return /^628\d{7,12}$/.test(withCountry) ? withCountry : null;
}

/* ─────────────────────────── run ─────────────────────────────────── */

async function workspaceDir(id: string): Promise<string> {
  const dir = resolve(process.cwd(), env.RESEARCH_WORKSPACE_DIR, "..", "prospecting", id);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Satu pekerjaan Research Prospecting:
 * Maps (scrape) → enrichment kontak → simpan ke `leads` → event + Scout job.
 */
export async function runProspecting(input: {
  niche: string;
  location: string;
  limit?: number;
  enrich?: boolean;
  queue?: boolean;
  excludeTech?: boolean;
  language?: string;
  /** Callback progres (untuk kartu kanban live). */
  onProgress?: ProspectProgressCallback;
}): Promise<ProspectRunResult> {
  const brief: ProspectBrief = {
    niche: input.niche.trim(),
    location: input.location.trim(),
    limit: input.limit ?? env.PROSPECTING_DEFAULT_LIMIT,
    enrich: input.enrich ?? env.PROSPECTING_ENRICH,
    queue: input.queue ?? true,
    excludeTech: input.excludeTech ?? env.PROSPECTING_EXCLUDE_TECH,
    language: input.language ?? "id",
  };

  const id = randomUUID();
  const dir = await workspaceDir(id);
  const errors: string[] = [];

  const places = await mapsSearch({
    query: brief.niche,
    location: brief.location,
    limit: brief.limit,
    waitForMs: env.PROSPECTING_WAIT_MS,
  });

  const cards: ProspectCard[] = [];

  const report = async (
    phase: ProspectProgress["phase"],
    extra: Partial<ProspectProgress> = {},
  ): Promise<void> => {
    if (!input.onProgress) return;
    const progress: ProspectProgress = {
      phase,
      niche: brief.niche,
      location: brief.location,
      total: places.length,
      processed: cards.length,
      enriched: cards.filter((c) => c.website || c.phone).length,
      saved: cards.filter((c) => c.saved).length,
      skipped: cards.filter((c) => !c.saved).length,
      excluded: cards.filter((c) => c.excluded).length,
      duplicates: cards.filter((c) => c.duplicate).length,
      ...extra,
    };
    await input.onProgress(progress);
  };

  await report("enrich", { processed: 0 });

  for (const place of places) {
    const card: ProspectCard = {
      name: place.name,
      source: "google_maps",
      niche: brief.niche,
      location: brief.location,
      category: place.category,
      rating: place.rating,
      reviews: place.reviews,
      phone: null,
      whatsapp: null,
      website: null,
      email: null,
      address: null,
      leadId: null,
      saved: false,
    };

    if (brief.enrich) {
      try {
        const contact = await enrichPlace(place.name, brief.location);
        card.phone = contact.phone;
        card.website = contact.website;
        card.email = contact.email;
        card.address = contact.address;
        if (contact.evidence) {
          await writeFile(
            resolve(dir, `${slugify(place.name)}.md`),
            contact.evidence,
            "utf8",
          );
        }
      } catch (err) {
        errors.push(`enrich ${place.name}: ${(err as Error).message}`);
      }
    }

    // Filter targeting: lewati bisnis yang bergerak di bidang teknologi.
    if (brief.excludeTech) {
      const exclusion = checkExcludedBusiness({
        name: card.name,
        category: card.category,
        website: card.website,
      });
      if (exclusion.excluded) {
        card.excluded = true;
        card.reason = `dikecualikan · ${exclusion.vertical} (kata kunci: ${exclusion.match})`;
        cards.push(card);
        await report("enrich");
        continue;
      }
    }

    // Dedup bisnis: nomor bisa berbeda, tapi nama+alamat/situs sama → lewati.
    const bizDuplicate = await findProspectByBusiness({
      company: place.name,
      address: card.address,
      website: card.website,
    });
    if (bizDuplicate) {
      card.leadId = bizDuplicate.id;
      card.duplicate = true;
      card.reason = "sudah ada di database (bisnis sama: nama + alamat/situs)";
      cards.push(card);
      await report("enrich");
      continue;
    }

    const mobile = normalizeMobile(card.phone ?? card.whatsapp);
    if (!mobile) {
      card.reason = card.website ? "nomor tidak ditemukan" : "kontak tidak ditemukan";
      cards.push(card);
      await report("enrich");
      continue;
    }

    try {
      const waJid = normalizeJid(mobile);
      card.whatsapp = mobile;

      // Dedup: jangan ambil ulang nomor yang sudah ada di database (lead/prospek).
      const existing = await getLeadByJid(waJid);
      if (existing) {
        card.leadId = existing.id;
        card.duplicate = true;
        card.reason = "sudah ada di database (nomor duplikat)";
        cards.push(card);
        await report("enrich");
        continue;
      }

      const lead = await upsertProspect({
        waJid,
        name: null,
        company: place.name,
        source: "google_maps",
        notes:
          `Prospek dari Google Maps. Rating ${place.rating ?? "-"} (${place.reviews ?? "-"} ulasan).` +
          (card.website ? ` Website: ${card.website}` : ""),
        tags: [brief.niche, brief.location].filter(Boolean),
        queue: brief.queue,
      });
      card.leadId = lead.id;
      card.saved = true;

      // Simpan detail prospek ke meta agar Scout (harian) bisa membacanya.
      await updateLead({
        id: lead.id,
        meta: {
          prospect: {
            website: card.website,
            email: card.email,
            address: card.address,
            rating: place.rating,
            reviews: place.reviews,
            category: place.category,
            niche: brief.niche,
            location: brief.location,
          },
        },
      });

      await emitEvent("prospect.discovered", {
        entityType: "lead",
        entityId: lead.id,
        payload: { ...card },
      });
      await enqueueJob({
        type: "scout.audit",
        payload: { ...card, leadId: lead.id },
      });
    } catch (err) {
      card.reason = `gagal menyimpan: ${(err as Error).message}`;
      errors.push(`save ${place.name}: ${(err as Error).message}`);
    }

    cards.push(card);
    await report("enrich");
  }

  const saved = cards.filter((c) => c.saved).length;
  const duplicates = cards.filter((c) => c.duplicate).length;
  const result: ProspectRunResult = {
    id,
    brief,
    discovered: places.length,
    enriched: cards.filter((c) => c.website || c.phone).length,
    saved,
    skipped: cards.length - saved,
    excluded: cards.filter((c) => c.excluded).length,
    duplicates,
    cards,
    errors,
    workspace: dir,
  };

  await writeFile(resolve(dir, "places.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await emitEvent("prospecting.completed", {
    entityType: "prospecting",
    entityId: id,
    payload: { id, discovered: result.discovered, saved, skipped: result.skipped, duplicates },
  });

  log.info(
    { id, discovered: result.discovered, saved, skipped: result.skipped, duplicates },
    "prospecting selesai",
  );

  await report("done");

  return result;
}

/* ───────────────────────── targeted run ──────────────────────────── */

export interface TargetedRunResult {
  location: string;
  verticals: Array<{ niche: string; industry: string; why: string }>;
  runs: ProspectRunResult[];
  totals: {
    discovered: number;
    enriched: number;
    saved: number;
    skipped: number;
    excluded: number;
    duplicates: number;
  };
}

/**
 * Satu putaran prospecting **tepat sasaran**: pilih niche dari katalog target
 * (bisnis yang butuh otomasi/AI tetapi awam teknologi), jalankan tiap niche,
 * lalu agregasikan hasilnya. Bisnis teknologi otomatis dikecualikan.
 */
export async function runTargetedProspecting(input: {
  location: string;
  /** Berapa niche diambil dari katalog (default 3). */
  count?: number;
  /** Batasi ke niche tertentu (nama persis dari katalog). */
  only?: string[];
  /** Batas kandidat Maps per niche. */
  limit?: number;
  /** Masukkan ke antrean outreach (default false = simpan saja). */
  queue?: boolean;
  /** Callback progres (untuk kartu kanban live). */
  onProgress?: ProspectProgressCallback;
}): Promise<TargetedRunResult> {
  const verticals = pickTargetVertical({ count: input.count ?? 3, only: input.only });
  const runs: ProspectRunResult[] = [];

  for (const vertical of verticals) {
    const result = await runProspecting({
      niche: vertical.niche,
      location: input.location,
      limit: input.limit,
      queue: input.queue ?? false,
      excludeTech: true,
      onProgress: input.onProgress,
    });
    runs.push(result);
  }

  const totals = runs.reduce(
    (acc, run) => ({
      discovered: acc.discovered + run.discovered,
      enriched: acc.enriched + run.enriched,
      saved: acc.saved + run.saved,
      skipped: acc.skipped + run.skipped,
      excluded: acc.excluded + run.excluded,
      duplicates: acc.duplicates + run.duplicates,
    }),
    { discovered: 0, enriched: 0, saved: 0, skipped: 0, excluded: 0, duplicates: 0 },
  );

  await emitEvent("prospecting.targeted_completed", {
    entityType: "prospecting",
    payload: {
      location: input.location,
      verticals: verticals.map((v) => v.niche),
      ...totals,
    },
  });

  log.info(
    { location: input.location, verticals: verticals.length, ...totals },
    "prospecting targeted selesai",
  );

  return {
    location: input.location,
    verticals: verticals.map((v) => ({ niche: v.niche, industry: v.industry, why: v.why })),
    runs,
    totals,
  };
}

/* ───────────────────── daily target (kuota harian) ────────────────── */

export interface DailyProspectingResult {
  location: string;
  target: number;
  /** Prospek yang sudah tersimpan hari ini sebelum putaran ini. */
  already: number;
  /** Yang baru tersimpan pada putaran ini. */
  saved: number;
  totalToday: number;
  rounds: Array<{ verticals: string[]; saved: number; skipped: number; excluded: number; duplicates: number }>;
}

/**
 * Kejar **target lead harian**. Menjalankan beberapa putaran targeted dengan
 * mengelilingi katalog niche (urut prioritas) sampai jumlah tersimpan hari ini
 * mencapai `target`, atau katalog/max-rounds habis.
 *
 * `already` dihitung dari lead `kind='prospect'` yang `first_seen` hari ini,
 * jadi aman dijalankan berulang.
 */
export async function runDailyProspecting(input: {
  location: string;
  target: number;
  nichesPerRound?: number;
  perNicheLimit?: number;
  maxRounds?: number;
  queue?: boolean;
  onProgress?: ProspectProgressCallback;
}): Promise<DailyProspectingResult> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const already = await countProspectsSince(startOfDay.toISOString(), input.location);

  const perRound = Math.max(1, input.nichesPerRound ?? env.PROSPECTING_NICHES_PER_ROUND);
  const maxRounds = Math.max(1, input.maxRounds ?? env.PROSPECTING_MAX_ROUNDS);
  const catalog = pickTargetVertical({ count: 10_000 });

  const rounds: DailyProspectingResult["rounds"] = [];
  let saved = 0;
  // Rotasi harian: mulai dari niche yang berbeda tiap hari agar cakupan bisnis
  // baru makin luas (tidak selalu mengulang niche yang sama).
  const totalRounds = Math.max(1, Math.ceil(catalog.length / perRound));
  const startRound = Math.floor(Date.now() / 86_400_000) % totalRounds;

  for (let step = 0; step < maxRounds; step += 1) {
    if (already + saved >= input.target) break;
    const round = (startRound + step) % totalRounds;
    const batch = catalog.slice(round * perRound, round * perRound + perRound);
    if (batch.length === 0) break;

    const result = await runTargetedProspecting({
      location: input.location,
      only: batch.map((v) => v.niche),
      limit: input.perNicheLimit ?? env.PROSPECTING_DEFAULT_LIMIT,
      queue: input.queue ?? true,
      onProgress: input.onProgress,
    });
    saved += result.totals.saved;
    rounds.push({
      verticals: batch.map((v) => v.niche),
      saved: result.totals.saved,
      skipped: result.totals.skipped,
      excluded: result.totals.excluded,
      duplicates: result.totals.duplicates,
    });
  }

  log.info(
    { location: input.location, target: input.target, already, saved, rounds: rounds.length },
    "prospecting harian (target) selesai",
  );

  return {
    location: input.location,
    target: input.target,
    already,
    saved,
    totalToday: already + saved,
    rounds,
  };
}
