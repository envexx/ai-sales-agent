# Research Agent — Universal Research Engine

Agent kedua di sistem ini. Berbeda dari Sales Agent yang menangani percakapan,
Research Agent menjalankan **pipeline riset** yang reusable untuk kebutuhan apa
pun, diparameterkan oleh sebuah **Research Brief**.

```
Research Brief Config
        │
        ▼
┌─────────────── Universal Research Engine (LangGraph) ───────────────┐
│ 1. Parameterized Planner                                            │
│        ▼                                                            │
│ 2. Dual-Engine Ingestion  (Firecrawl + Camoufox)                    │
│        ▼                                                            │
│ 3. Context Pruning & Fact Extraction                                │
│        ▼                                                            │
│ 4. Strict Gap/Depth Evaluator ── depth < max & perlu data ──┐       │
│        │ selesai / cap limit                                │       │
│        ▼                                                    └─► 1.  │
│ 5. Schema-Driven Formatter                                          │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
Laporan sesuai format Brief + evidence di folder workspace
```

## Struktur file

```
src/research/
  types.ts              # ResearchBrief, PlanTask, SourceDoc, Fact, laporan
  brief.ts              # skema zod + normalisasi + bagian laporan default
  state.ts              # ResearchState (Annotation.Root)
  prompts.ts            # prompt planner/extractor/evaluator/formatter
  util.ts               # URL, prune teks, mapLimit, dedupe
  search.ts             # lapisan discovery (auto/firecrawl/bing/camoufox)
  workspace.ts          # folder evidence + tulis file
  index.ts              # build graph + routeAfterVerify + RESEARCH_MERMAID
  run.ts                # runResearch(brief) — entry point
  nodes/
    planner.ts          # 1. Parameterized Planner
    ingest.ts           # 2. Dual-Engine Ingestion
    extract.ts          # 3. Context Pruning & Fact Extraction
    verify.ts           # 4. Strict Gap/Depth Evaluator
    format.ts           # 5. Schema-Driven Formatter

src/integrations/
  firecrawl.ts          # engine #1: search + scrape (self-hosted)
  camoufox.ts           # engine #2: browser stealth (via skrip Python)

scripts/camoufox_fetch.py   # jembatan Node → Camoufox
```

## Research Brief

Semua perilaku engine ditentukan brief. Field penting (semua opsional kecuali
`title` & `objective`):

| Field | Default | Keterangan |
| --- | --- | --- |
| `title`, `objective` | — | Judul & sasaran riset |
| `questions` | `[]` | Sub-pertanyaan pemandu |
| `depth` | `RESEARCH_DEFAULT_DEPTH` (2) | Target kedalaman 1–5 |
| `maxIterations` | `RESEARCH_MAX_ITERATIONS` (3) | Batas putaran loop |
| `maxSources` | `RESEARCH_MAX_SOURCES` (12) | Batas jumlah sumber |
| `timeBudgetMs` | `RESEARCH_TIME_BUDGET_MS` | Batas waktu keseluruhan |
| `seedUrls` | `[]` | URL awal (dipakai tanpa discovery) |
| `includeDomains` / `excludeDomains` | `[]` | Batasi/prioritaskan domain |
| `language` | `id` | Bahasa laporan |
| `format` | `markdown` | `markdown` atau `json` |
| `sections` | bawaan | Struktur bagian laporan |
| `metadata` | `{}` | Data bebas integrasi |

Skema mesin: `GET /research/schema`.

## Cara pemakaian

### 1. Endpoint API

```bash
curl -X POST http://localhost:4000/research ^
  -H "content-type: application/json" ^
  -H "x-api-key: $API_KEY" ^
  -d "{\"title\":\"Riset pasar AI agent UKM\",\"objective\":\"Analisis adopsi AI agent di UKM Indonesia 2026\",\"depth\":3,\"format\":\"markdown\"}"
```

Endpoint terkait:

| Method | Path | Fungsi |
| --- | --- | --- |
| `POST` | `/research` | Jalankan riset (body = brief) |
| `GET` | `/research` | Daftar laporan (metadata) |
| `GET` | `/research/:id` | Detail metadata laporan |
| `GET` | `/research/:id/report` | Isi laporan (md/json) |
| `GET` | `/research/:id/evidence` | Daftar file evidence |
| `GET` | `/research/schema` | Skema brief |
| `GET` | `/research/mermaid` | Diagram engine |

### 2. Lewat Supervisor (chat/WhatsApp)

Kirim pesan yang mengandung kata kunci riset ("riset", "bandingkan",
"analisis mendalam", …) dan supervisor akan mengarahkan ke Research Agent.

> Riset via chat dibatasi ketat (`RESEARCH_CHAT_*`) agar tidak memblokir turn
> percakapan. Riset berat gunakan `POST /research`.

## Penyimpanan (metadata vs file)

- **Postgres** (`research_reports`): id, judul, objective, status, format,
  ringkasan, kualitas, jumlah sumber/fakta, path laporan, error, timestamps.
- **Folder workspace** `RESEARCH_WORKSPACE_DIR/<reportId>/`:
  - `brief.json` — brief yang dipakai
  - `plan.json`/`trace.json` — rencana + jejak eksekusi
  - `sources.json` — metadata sumber (URL, engine, file evidence)
  - `facts.json` — fakta terekstrak + sitasi
  - `report.md` / `report.json` — laporan akhir
  - `evidence/<n>-<slug>.md` + `.html` — isi halaman + screenshot (Camoufox)

## Dual-engine ingestion

Tahap **ingestion** punya dua bagian: *discovery* (menemukan URL) dan
*pengambilan isi* (fetch halaman).

### Discovery (`RESEARCH_SEARCH_PROVIDER`)

| Nilai | Sumber |
| --- | --- |
| `auto` (default) | Tavily (bila aktif) → SearXNG → Bing (Firecrawl) → Bing (Camoufox) → Firecrawl `/v1/search` |
| `tavily` | Tavily Search API (`TAVILY_API_KEY`) — discovery untuk AI agent |
| `searxng` | SearXNG JSON API (`RESEARCH_SEARXNG_URL`, default proxy `:8081`) |
| `bing` | Bing via Firecrawl, fallback Camoufox |
| `camoufox` | Bing via browser stealth Camoufox |
| `firecrawl` | Endpoint `/v1/search` Firecrawl |
| `none` | Tanpa discovery — hanya `seedUrls` pada brief |

> **Kenapa lewat proxy?** `/v1/search` Firecrawl self-hosted dapat mengembalikan
> hasil tak relevan (bergantung SearXNG). Discovery karena itu memakai SearXNG
> langsung. Karena SearXNG milik stack Firecrawl tidak ter-publish ke host, service
> `searxng-proxy` (socat, ada di `docker-compose.yml`) meneruskan port-nya ke
> `localhost:8081` tanpa mengubah compose Firecrawl.

> Catatan: `/v1/search` self-hosted bergantung pada SearXNG dan bisa tidak
> konsisten. Karena itu default `auto` memakai Bing (URL hasil di-decode dari
> parameter `u=a1<base64url>`) dan menyaring domain spam.

### Pengambilan isi

1. **Firecrawl** (`FIRECRAWL_BASE_URL`, default `http://127.0.0.1:3002`) —
   pengambilan bersih (markdown + html) lewat `/v1/scrape`.
2. **Camoufox** — browser stealth (Firefox) untuk halaman berat JS / anti-bot.

Strategi: Firecrawl dicoba dulu; bila gagal/kosong, otomatis fallback ke
Camoufox. Bila `camoufox` belum terpasang, engine tetap jalan dengan Firecrawl.

Pasang Camoufox:

```bash
pip install camoufox
camoufox fetch      # unduh browser (sekali)
```

## Menyesuaikan

- **Struktur laporan:** isi `sections` di brief, atau ubah default di
  `effectiveSections()` (`src/research/brief.ts`).
- **Prompt peran:** `src/research/prompts.ts`.
- **Ganti/sumber baru:** tambah fungsi di `src/integrations/` lalu pakai di
  `src/research/nodes/ingest.ts`.
- **Ubah kebijakan loop:** `routeAfterVerify()` di `src/research/index.ts`.
