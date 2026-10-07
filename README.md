# AI Sales Agent — LangGraph · DeepSeek · WhatsApp · pgvector

Agen sales WhatsApp otomatis dengan dashboard monitoring. Setiap pesan masuk melewati
pipeline state machine **LangGraph**: deteksi bot → RAG → lead scoring → pemilihan
strategi → penjadwalan (Cal.com) → generasi balasan → kirim → booking → evaluasi →
reflection → long-term memory, lalu memori itu dipakai lagi oleh RAG.

Selain membalas prospek, agen juga **menghubungi prospek dari luar** (hasil impor via
webhook) pada jam kerja saja, dengan typing indicator dan jeda yang menyesuaikan
panjang pesan.

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1.4-1C3C3C)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-radix-000000)
![Postgres](https://img.shields.io/badge/Postgres-16%20%2B%20pgvector-4169E1?logo=postgresql&logoColor=white)
![DeepSeek](https://img.shields.io/badge/LLM-DeepSeek-4D6BFE)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys-25D366?logo=whatsapp&logoColor=white)

> © 2026 — All rights reserved. Repositori ini dipublikasikan sebagai portofolio;
> kode tidak dilisensikan untuk dipakai ulang secara publik.

## Fitur utama

- **Agent Supervisor (orchestrator)** — memilih agent worker untuk setiap pesan masuk (Sales & Research); menambah agent baru cukup 1 node + 1 cabang routing
- **Business pipeline (F0)** — orkestrasi event/jadwal: job queue + scheduler, event log, notifikasi owner, approval human-in-the-loop, dan Daily Briefing ([`docs/PIPELINE-F0.md`](docs/PIPELINE-F0.md))
- **Alur bisnis multi-agent** — acuan resmi peran & gate tiap agent (supervisor = peninjau, Sales = pusat pipeline): [`docs/FLOW.md`](docs/FLOW.md)
- **Research Agent (Universal Research Engine)** — pipeline riset reusable ber-loop: planner → dual-engine ingestion (Firecrawl + Camoufox) → ekstraksi fakta → evaluator kedalaman → formatter schema-driven; laporan & evidence tersimpan sebagai file
- **Research Prospecting (D1)** — cari prospek bisnis via **Google Maps (scraping)** dengan **targeting** niche "siap-AI/low-tech" (bisnis yang butuh otomasi tapi jarang memakainya; bisnis teknologi dikecualikan), lengkapi kontak (telepon/website) dengan bantuan **Tavily** (search + extract), simpan ke `leads` + antrean outreach; **Scout** menyusun pain-point & sudut pendekatan ([`docs/PROSPECTING.md`](docs/PROSPECTING.md))
- **Scoper & PRD Builder (F2)** — dari transkrip Sales menghasilkan **PRD** (alur, webhook/API, struktur DB) + checklist teknis, tersimpan di `projects` + file ([`docs/SCOPER.md`](docs/SCOPER.md))
- **Legal & Finance (F2)** — dari PRD menghasilkan draf **SPK + NDA + invoice DP**, mencatat invoice, dan memverifikasi pembayaran DP ([`docs/LEGAL.md`](docs/LEGAL.md))
- **Agent F3–F5** — Intake & Credential (vault terenkripsi), QA & Guardrail, Documentation/SOP, Handover & Final Invoice, L1 Support, Infra Monitor, Retainer & Upsell, Case Study ([`docs/AGENTS.md`](docs/AGENTS.md))
- **Flywheel tertutup** — studi kasus otomatis masuk **knowledge base** dan dipakai ulang oleh Sales (RAG) & Scout (bukti sosial) untuk prospek berikutnya
- **Rantai otomatis** — research & scout → scoper → legal → intake → QA & docs → handover → developer/content, plus briefing + monitor harian
- **LLM multi-provider** — DeepSeek / Antigravity / **OpenRouter** (model gratis) dengan rantai fallback terpusat ([`docs/LLM-PROVIDERS.md`](docs/LLM-PROVIDERS.md))
- **Kanban bisnis live** — proses yang sedang berjalan (termasuk riset prospek) tampil di kanban begitu dimulai, lengkap dengan **progres** (tahap & hitungan), tanpa menunggu selesai
- **LangGraph state machine** — 14 node dengan checkpointer Postgres (memori percakapan lintas-turn)
- **Triage bot vs manusia** — 11 pola regex heuristik, LLM fail-open
- **RAG + long-term memory** — pgvector untuk knowledge base dan feedback loop refleksi
- **Lead scoring 0–100** (heuristik + LLM) → segmen Nurture / Objection / Closing
- **Balasan WhatsApp yang manusiawi** — typing indicator, jeda sesuai panjang teks, read receipt
- **Media masuk dipahami** — **voice note** ditranskrip lokal (faster-whisper), **gambar** dideskripsikan (DeepSeek vision), lalu dibalas normal; hanya jalan saat diperlukan
- **Anti balasan dobel** — pesan yang terkirim ulang di-dedup by id + diproses berurutan per kontak; **pesan identik berulang** dilewati
- **Penjadwalan Cal.com via MCP** — cek slot kosong dan buat booking langsung
- **Outreach otomatis** — hanya jam kerja, batch + jeda, opt-out otomatis saat prospek balas STOP
- **Webhook lead** — 3 bentuk body, alias field ID/EN, validasi per-field → [`docs/WEBHOOK-LEADS.md`](docs/WEBHOOK-LEADS.md)
- **Dashboard Next.js 16 + shadcn/ui** — 6 halaman, status WhatsApp live via SSE
- **Office (Claw3D)** — control room visual: lihat semua agent bekerja live & **chat dengan supervisor/agent** lewat gateway adapter (`claw3d/server/business-gateway-adapter.js`)

## Tangkapan Layar

**Ringkasan** — pipeline per segmen, volume lead 14 hari, evaluasi terbaru.

![Ringkasan](docs/screenshots/overview.png)

| Leads | Detail lead |
| --- | --- |
| ![Leads](docs/screenshots/leads.png) | ![Detail lead](docs/screenshots/lead-detail.png) |

| Kualitas agen | Alur kerja (state machine) |
| --- | --- |
| ![Kualitas](docs/screenshots/kualitas.png) | ![Workflow](docs/screenshots/workflow.png) |

**Pengaturan** — koneksi WhatsApp via QR, impor lead (webhook), outreach otomatis.

![Pengaturan](docs/screenshots/pengaturan.png)

## Arsitektur

```mermaid
flowchart TD
    webhook["WhatsApp / API Turn"] --> supervisor["Supervisor Agent"]
    supervisor -->|"agent: sales"| triage["AI Triage / Bot Detection"]
    supervisor -->|"agent: research"| rpipeline["Research Engine (planner … formatter)"]
    triage -->|BOT| filter["Filter"]
    triage -->|HUMAN| rag["RAG"]
    rag --> scoring["Lead Scoring"]
    scoring -->|"< 40"| nurture["Nurture"]
    scoring -->|"40-74"| objection["Objection"]
    scoring -->|">= 75"| closing["Closing"]
    nurture --> response["Response Generation"]
    objection --> response
    closing --> response
    response --> dispatch["WhatsApp Dispatch"]
    dispatch --> booking["Booking / Follow-up"]
    booking --> evaluation["Evaluation / Critique"]
    evaluation --> reflection["Reflection Engine"]
    reflection --> ltm["Long-Term Memory"]
    ltm -->|feedback| rag
```

Semua pesan masuk lewat **Supervisor Agent** terlebih dahulu. Supervisor memilih
agent worker yang tepat (saat ini hanya **Sales**), lalu worker menjalankan
pipeline-nya sendiri. Detail: [`docs/SUPERVISOR.md`](docs/SUPERVISOR.md).

### Node supervisor (orchestrator)

| Node (LangGraph) | File | Peran |
| --- | --- | --- |
| `supervisor` | `src/supervisor/nodes/supervisor.ts` | Pilih agent (heuristik → LLM → default) untuk tiap turn |
| `sales` (worker) | `src/supervisor/nodes/sales.ts` | Jalankan graph Sales lalu ringkas hasilnya untuk supervisor |
| `prospecting` (worker) | `src/supervisor/nodes/prospecting.ts` | Research Prospecting (Maps) — chat menjadwalkan job, hasil dikirim ke owner |

### Node graph Sales

| Node (LangGraph) | File | Peran |
| --- | --- | --- |
| `triageMessage` | `src/graph/nodes/triage.ts` | Deteksi bot/sistem (heuristik + LLM) dan ekstraksi intent |
| `filter` | `src/graph/nodes/filter.ts` | Cabang terminal untuk pesan bot — dibuang, tidak dibalas |
| `rag` | `src/graph/nodes/rag.ts` | Retrieval dari knowledge base + long-term memory |
| `leadScoring` | `src/graph/nodes/leadScoring.ts` | Skor 0-100 (heuristik + LLM) dan penentuan segmen |
| `nurture` / `objection` / `closing` | `src/graph/nodes/strategies.ts` | Strategi sesuai band skor |
| `scheduling` | `src/graph/nodes/scheduling.ts` | Cek ketersediaan & buat booking via **Cal.com MCP** |
| `responseGeneration` | `src/graph/nodes/responseGeneration.ts` | Menulis balasan WhatsApp |
| `dispatch` | `src/graph/nodes/dispatch.ts` | Kirim via transport (Baileys / console, dengan DRY_RUN) |
| `bookingFlow` | `src/graph/nodes/booking.ts` | Deteksi booking & jadwal follow-up |
| `critique` | `src/graph/nodes/evaluation.ts` | Evaluasi/kritik balasan (relevance, groundedness, dll) |
| `reflect` | `src/graph/nodes/reflection.ts` | Ubah kritik menjadi pelajaran yang bisa dipakai ulang |
| `longTermMemory` | `src/graph/nodes/longTermMemory.ts` | Simpan reflection + update lead (edge balik ke RAG) |

> **Catatan penamaan:** LangGraph v1 tidak mengizinkan nama node yang sama
> dengan nama channel/state, jadi node `booking`, `evaluation`, dan `reflection`
> diberi sufiks (`bookingFlow`, `critique`, `reflect`) sementara field state
> tetap memakai nama semantiknya.

### Research Agent — Universal Research Engine

Worker kedua di bawah supervisor. Reusable: semua perilaku ditentukan sebuah
**Research Brief** (topik, sub-pertanyaan, kedalaman, batas sumber, format,
struktur bagian). Detail: [`docs/RESEARCH.md`](docs/RESEARCH.md).

```mermaid
flowchart TD
    brief["Research Brief Config"] --> planner["1. Parameterized Planner"]
    planner --> ingest["2. Dual-Engine Ingestion (Firecrawl + Camoufox)"]
    ingest --> extract["3. Context Pruning & Fact Extraction"]
    extract --> verify["4. Strict Gap/Depth Evaluator"]
    verify -->|"depth < max & perlu data"| planner
    verify -->|"selesai / cap limit"| formatter["5. Schema-Driven Formatter"]
    formatter --> output["Laporan Sesuai Format Brief"]
```

| Node (LangGraph) | File | Peran |
| --- | --- | --- |
| `planner` | `src/research/nodes/planner.ts` | Pecah objective → tugas + query (parameterized) |
| `ingest` | `src/research/nodes/ingest.ts` | Discovery + ambil halaman via Firecrawl, fallback Camoufox |
| `extract` | `src/research/nodes/extract.ts` | Pangkas konteks + ekstrak fakta bersitasi |
| `verify` | `src/research/nodes/verify.ts` | Nilai kedalaman/kualitas + daftar gap |
| `formatter` | `src/research/nodes/format.ts` | Susun laporan sesuai struktur brief |

Metadata laporan disimpan di tabel `research_reports`; laporan dan evidence
disimpan sebagai file di `workspace/research/<reportId>/`.

## Stack

- **Orkestrasi:** LangGraph.js `1.x` (`StateGraph`, `Annotation.Root`, checkpointer Postgres)
- **LLM:** DeepSeek (`deepseek-chat`, opsional `deepseek-reasoner`) via `@langchain/openai` dengan `useResponsesApi: false`
- **WhatsApp:** Baileys (`baileys@6.7`, WhatsApp Web) + transport `console` untuk dev
- **Storage:** Postgres 16 + `pgvector` (RAG, long-term memory, checkpointer LangGraph)
- **Embeddings:** pluggable — `hash` (default, offline), `local` (transformers.js), `openai`

## Mulai Cepat

```bash
# 1. Install dependency
npm install

# 2. Nyalakan Postgres + pgvector (+ proxy SearXNG untuk Research Agent)
docker compose up -d

# 3. Konfigurasi
copy .env.example .env        # Windows
# cp .env.example .env        # macOS/Linux
#   → isi DEEPSEEK_API_KEY

# 4. Isi knowledge base
npm run seed

# 5. Jalankan
npm run dev                   # server + transport (WA_TRANSPORT di .env)
```

Uji cepat tanpa WhatsApp dan tanpa biaya LLM:

```bash
npm run sim                   # simulasi percakapan (transport=console, DRY_RUN=true)
```

Server API:

```bash
curl -X POST http://localhost:4000/simulate ^
  -H "content-type: application/json" ^
  -d "{\"from\":\"6281234567890\",\"name\":\"Dita\",\"text\":\"Berapa harga website?\"}"
```

## Konsep penting

### Lead scoring
Skor `0-100` = gabungan **heuristik deterministik** (kata kunci: harga, demo,
budget, urgensi, keberatan, panjang pesan) dan **penilaian LLM**, dibobot
`0.4 / 0.6`. Band:

| Skor | Segmen | Pendekatan |
| --- | --- | --- |
| `< SCORE_THRESHOLD_LOW` (default 40) | `nurture` | Bangun kepercayaan, tanpa hard sell |
| `40 – 74` | `objection` | Tangani keberatan, dorong langkah berikutnya |
| `>= SCORE_THRESHOLD_HIGH` (default 75) | `closing` | CTA langsung, amankan demo/booking |

Jika LLM gagal, scoring otomatis jatuh ke heuristik saja (tidak pernah gagal total).

### RAG & Long-Term Memory
`rag` menarik konteks dari dua sumber paralel:

1. **`knowledge_docs`** — produk, harga, FAQ, playbook keberatan (hasil `npm run seed`).
2. **`long_term_memory`** — reflection dari percakapan sebelumnya.

Relasi ini merealisasikan edge terakhir diagram **Long-Term Memory ──► RAG**:
setiap reflection yang ditulis di akhir satu turn menjadi konteks yang bisa
diretrieval pada turn berikutnya. Reflection juga dipercaya lintas-lead
(`WHERE lead_id = $lead OR lead_id IS NULL`), jadi pelajaran umum ikut terbawa.

Bila `MAX_REFLECTION_LOOPS > 0`, graph juga dapat **masuk kembali ke `rag`**
secara langsung untuk merevisi draft yang bernilai rendah (`evaluation.overall < 5`).
`dispatch` dilindungi agar tidak mengirim dua kali.

### Embeddings
DeepSeek tidak menyediakan endpoint embeddings, jadi provider-nya pluggable
(`EMBEDDING_PROVIDER`):

- `hash` *(default)* — deterministik, tanpa dependensi, jalan offline. Bagus untuk demo/CI.
- `local` — `@huggingface/transformers` (opsional; model default `Xenova/all-MiniLM-L6-v2`, 384-dim).
- `openai` — endpoint `/embeddings` apa pun yang OpenAI-compatible (`EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`).

`EMBEDDING_DIM` **harus** sama dengan dimensi kolom `vector(384)` di
`sql/init.sql`. Ganti provider berdimensi beda → ubah dimensi kolom lalu reseed.

### Bot vs Human
`triageMessage` menjalankan pola regex heuristik lebih dulu (OTP, "pesan
otomatis", "balas 1", broadcast, dsb). Jika lolos, LLM baru memutuskan.
Keputusan fail-**open**: pesan dianggap manusia bila LLM ragu, supaya lead asli
tidak pernah terbuang.

## Konfigurasi (`.env`)

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | – | **Wajib** untuk node LLM |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Base URL DeepSeek |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Model utama (mendukung tool calling) |
| `DEEPSEEK_REASONING_MODEL` | `deepseek-reasoner` | Dipakai untuk critique/reflection bila `USE_REASONING_MODEL=true` |
| `LLM_PROVIDER` | `deepseek` | Provider default: `deepseek` \| `antigravity` \| `openrouter` |
| `LLM_PROVIDER_OVERRIDES` | – | Override per-node, mis. `SupervisorRoute=antigravity,ResearchPlan=antigravity` |
| `LLM_FALLBACK_TO_DEEPSEEK` | `true` | Fallback otomatis ke DeepSeek bila provider utama gagal |
| `LLM_FALLBACK_PROVIDERS` | – | Rantai fallback berlapis (urut), mis. `openrouter,deepseek` |
| `ANTIGRAVITY_BIN` / `ANTIGRAVITY_MODEL` / `ANTIGRAVITY_EFFORT` | `agy` / – / `medium` | Antigravity CLI ([`docs/LLM-PROVIDERS.md`](docs/LLM-PROVIDERS.md)) |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | – / `nvidia/nemotron-3-ultra-550b-a55b:free` | OpenRouter (model gratis) sebagai provider/fallback |
| `PIPELINE_ENABLED` / `PIPELINE_TICK_SECONDS` / `PIPELINE_BATCH` | `true` / `30` / `5` | Scheduler pipeline (F0) |
| `OWNER_WA_JID` / `OWNER_NAME` | – / `Owner` | Nomor WhatsApp owner (notifikasi & perintah) |
| `NOTIFY_ENABLED` | `true` | Aktifkan notifikasi owner |
| `BRIEFING_ENABLED` / `BRIEFING_HOUR` / `BRIEFING_TIMEZONE` | `true` / `8` / `Asia/Jakarta` | Daily Briefing |
| `APPROVAL_TTL_HOURS` / `APPROVAL_PREFIX` | `72` / `APV` | Approval human-in-the-loop |
| `APP_SECRET` | – | Kunci enkripsi vault kredensial (F2) |
| `PROSPECTING_ENABLED` / `PROSPECTING_DEFAULT_LIMIT` | `true` / `8` | Research Prospecting (D1) |
| `PROSPECTING_ENRICH` / `PROSPECTING_WAIT_MS` | `true` / `6000` | Enrichment kontak & tunggu render Maps |
| `PROSPECTING_TARGET_COUNT` / `PROSPECTING_EXCLUDE_TECH` | `3` / `true` | Mode tepat sasaran: jumlah niche dari katalog & kecualikan bisnis teknologi |
| `PROSPECTING_DAILY_TARGET` / `PROSPECTING_NICHES_PER_ROUND` / `PROSPECTING_MAX_ROUNDS` | `20` / `3` / `8` | Target lead tersimpan/hari & ritme putaran (job harian mengelilingi katalog) |
| `SCOPER_ENABLED` / `PROJECTS_WORKSPACE_DIR` | `true` / `./workspace/projects` | Scoper & PRD (F2) |
| `LEGAL_ENABLED` / `LEGAL_DUE_DAYS` | `true` / `7` | Legal & Finance (F2) |
| `INTAKE_ENABLED` · `QA_ENABLED` · `SCRIBE_ENABLED` · `HANDOVER_ENABLED` | `true` | Agent F2–F4 |
| `SUPPORT_ENABLED` · `MONITOR_ENABLED` · `RETAINER_ENABLED` · `CONTENT_ENABLED` | `true` | Agent F4–F5 |
| `MONITOR_MEMORY_MB` / `MONITOR_WEBHOOK_TIMEOUT_MS` | `1024` / `5000` | Ambang monitor |
| `TELEGRAM_ENABLED` / `TELEGRAM_BOT_TOKEN` | `true` / – | Bot Telegram L1 Support (kanal klien) |
| `DATABASE_URL` | `postgres://sales:sales@localhost:5432/sales` | Postgres |
| `EMBEDDING_PROVIDER` | `hash` | `hash` \| `local` \| `openai` |
| `EMBEDDING_DIM` | `384` | Harus cocok dengan `vector(384)` |
| `WA_TRANSPORT` | `console` | `console` (dev) \| `baileys` |
| `WA_AUTH_DIR` | `./baileys_auth` | Folder sesi Baileys |
| `WA_SEND_CONNECT_TIMEOUT_MS` / `WA_SEND_RETRIES` / `WA_SEND_RETRY_MS` | `20000` / `3` / `3000` | Tunggu koneksi & coba ulang kirim balasan yang gagal |
| `MEDIA_ENABLED` / `WHISPER_ENABLED` / `WHISPER_MODEL` | `true` / `true` / `small` | Voice note → transkrip lokal (faster-whisper) |
| `VISION_ENABLED` / `VISION_MODEL` | `true` / – | Gambar → deskripsi (DeepSeek vision) |
| `DRY_RUN` | `true` | `true` = tidak benar-benar mengirim pesan |
| `WA_AUTO_CONNECT` | `true` | Sambungkan WhatsApp otomatis saat boot |
| `WA_DEFAULT_COUNTRY_CODE` | `62` | Kode negara untuk normalisasi nomor lead |
| `OUTREACH_ENABLED` | `true` | Aktifkan penjadwal outreach |
| `WORK_START_HOUR` / `WORK_END_HOUR` | `8` / `17` | Jam kerja (24 jam) untuk outreach |
| `WORK_DAYS` | `1,2,3,4,5` | Hari kerja (ISO: 1=Senin … 7=Minggu) |
| `WORK_TIMEZONE` | `Asia/Jakarta` | Zona waktu jam kerja |
| `OUTREACH_BATCH` | `3` | Maksimal prospek per tick |
| `OUTREACH_MAX_ATTEMPTS` | `2` | 1 pembuka + 1 follow-up |
| `OUTREACH_FOLLOWUP_HOURS` | `48` | Jeda sebelum follow-up |
| `RAG_TOP_K` / `LTM_TOP_K` | `5` / `3` | Jumlah dokumen yang diambil |
| `MAX_REFLECTION_LOOPS` | `0` | Batas loop LTM→RAG per turn |
| `SCORE_THRESHOLD_LOW/HIGH` | `40` / `75` | Ambang band skor |
| `SUPERVISOR_FORCE_LLM` | `false` | Paksa supervisor memakai LLM untuk routing walau agent baru satu |
| `RESEARCH_ENABLED` | `true` | Aktifkan Research Agent |
| `RESEARCH_WORKSPACE_DIR` | `./workspace/research` | Folder laporan + evidence (file) |
| `RESEARCH_DEFAULT_DEPTH` / `RESEARCH_MAX_ITERATIONS` | `2` / `3` | Kedalaman & batas loop |
| `RESEARCH_MAX_SOURCES` / `RESEARCH_MAX_FACTS` | `12` / `80` | Batas sumber & fakta |
| `RESEARCH_TIME_BUDGET_MS` | `240000` | Batas waktu riset (ms) |
| `RESEARCH_CHAT_ENABLED` / `RESEARCH_CHAT_MAX_ITERATIONS` | `true` / `1` | Batas riset via chat |
| `FIRECRAWL_ENABLED` / `FIRECRAWL_BASE_URL` | `true` / `http://127.0.0.1:3002` | Engine ingestion #1 |
| `FIRECRAWL_API_KEY` | – | Opsional (kosong = tanpa auth) |
| `RESEARCH_SEARCH_PROVIDER` | `auto` | Discovery: `auto` \| `tavily` \| `searxng` \| `firecrawl` \| `bing` \| `camoufox` \| `none` |
| `RESEARCH_SEARXNG_URL` | `http://127.0.0.1:8081` | Endpoint SearXNG (via `searxng-proxy`) |
| `CAMOUFOX_ENABLED` / `CAMOUFOX_PYTHON` | `true` / `python` | Engine ingestion #2 (stealth browser) |
| `TAVILY_ENABLED` / `TAVILY_API_KEY` | `true` / – | Tavily Search + Extract (discovery & enrichment tambahan) |
| `TAVILY_SEARCH_DEPTH` / `TAVILY_EXTRACT_DEPTH` | `basic` | `basic` \| `advanced` |
| `TAVILY_MAX_RESULTS` | `8` | Maksimum hasil per pencarian Tavily |
| `BUSINESS_NAME` / `BUSINESS_DESCRIPTION` / `SALES_REP_NAME` / `BOOKING_LINK` | – | Konteks bisnis yang disuntikkan ke prompt |
| `API_KEY` | – | Jika diisi, `/webhook/whatsapp` butuh header `x-api-key` |
| `CAL_API_KEY` | – | API key Cal.com — mengaktifkan MCP scheduling |
| `CAL_MCP_URL` | – | Alternatif hosted MCP (`https://mcp.cal.com/mcp`, OAuth) |
| `CAL_MCP_ALL_TOOLS` | `true` | Ekspos semua tool Cal.com (perlu untuk slot) |
| `CAL_EVENT_TYPE_ID` | – | Paksa event type untuk booking |
| `CAL_TIMEZONE` | `Asia/Jakarta` | Zona waktu slot |
| `CAL_SLOT_DAYS` | `7` | Rentang hari pencarian slot |

## HTTP API

| Method | Path | Fungsi |
| --- | --- | --- |
| `GET` | `/health` | Status transport, mode dry-run, embedding, model |
| `POST` | `/webhook/whatsapp` | Proses satu pesan masuk (`{ from, name?, text, threadId? }`) |
| `POST` | `/simulate` | Sama seperti webhook, tanpa API key — untuk uji lokal |
| `GET` | `/leads` | Daftar lead beserta skor & segmen |
| `GET` | `/conversations/:threadId` | Transkrip percakapan |
| `GET` | `/graph/mermaid` | Diagram arsitektur (Mermaid) |
| `GET` | `/agents` | Daftar agent yang terdaftar di supervisor |
| `GET` | `/supervisor/mermaid` | Diagram arsitektur supervisor (Mermaid) |
| `GET` \| `POST` | `/supervisor/chat` | Riwayat / kirim pesan ke **Supervisor (penasihat)** |
| `GET` \| `PUT` | `/supervisor/profile` | Profil & tujuan owner yang dibaca Supervisor |
| `GET` | `/agents/growth` | KPI & tren pertumbuhan per agent |
| `POST` | `/agents/optimize` | Jalankan loop usulan perbaikan agent |
| `GET` | `/improvements` | Pelajaran & usulan perbaikan per agent |
| `POST` | `/improvements/:id/approve` \| `/reject` | Putuskan usulan (approve → masuk Knowledge) |
| `GET` | `/research/schema` | Skema body Research Brief |
| `POST` | `/research` | Jalankan riset (body = brief) |
| `GET` | `/research` | Daftar laporan riset |
| `GET` | `/research/:id` | Detail metadata laporan |
| `GET` | `/research/:id/report` | Isi laporan (markdown/JSON) |
| `GET` | `/research/:id/evidence` | Daftar file evidence |
| `GET` | `/research/mermaid` | Diagram engine riset (Mermaid) |
| `POST` | `/prospecting` | Jalankan prospecting (body: `{ niche, location, limit? }`) |
| `GET` | `/prospecting/niches` | Katalog niche target + vertikal teknologi yang dikecualikan |
| `POST` | `/prospecting/targeted` | 1 putaran tepat sasaran (body: `{ location, count?, only?, limit?, queue? }`) |
| `POST` | `/scoper` | Buat PRD dari transkrip (body: `{ leadId? / threadId?, title? }`) |
| `GET` | `/projects` | Daftar proyek + PRD |
| `POST` | `/legal` | Buat draf SPK/NDA + invoice DP (body: `{ projectId, amount }`) |
| `GET` | `/invoices` | Daftar invoice |
| `POST` | `/projects/:id/dp-paid` | Tandai DP proyek lunas |
| `POST` | `/projects/:id/built` | Tandai sistem selesai dibangun → jalankan QA |
| `POST` | `/intake/:projectId` · `GET\|POST` `/projects/:id/credentials` | Intake & vault kredensial |
| `POST` | `/qa/:projectId` · `/scribe/:projectId` · `/handover/:projectId` | QA, Dokumentasi, Serah terima |
| `POST` | `/support` · `GET` `/tickets` · `POST` `/monitor/check` | L1 support & pemantauan |
| `GET` \| `POST` | `/channels` | Kanal klien (Telegram chat_id → proyek) |
| `GET` | `/knowledge` | Knowledge base (filter `?source=case_study`) |
| `GET` | `/agents` \| `/agents/status` | Registry agent & status live (dipakai navigasi dashboard) |
| `POST` | `/developer/:projectId` (maintain) · `/developer/build` · `/developer/apply` · `/content/:projectId` | Developer (OpenCode) & studi kasus |
| `GET` | `/pipeline/snapshot` | Ringkasan pipeline (data briefing) |
| `GET` \| `POST` | `/pipeline/jobs` | Daftar / enqueue job |
| `POST` | `/pipeline/tick` | Proses job jatuh tempo |
| `GET` | `/pipeline/events` | Log event bisnis |
| `POST` | `/briefing/run` | Jalankan Daily Briefing sekarang |
| `GET` \| `POST` | `/approvals` | Daftar / minta persetujuan |
| `POST` | `/approvals/:id/approve` \| `/reject` | Putuskan persetujuan |

Contoh respons `/simulate`:

```json
{
  "threadId": "wa:6281234567890@s.whatsapp.net",
  "isBot": false,
  "leadScore": 82,
  "segment": "closing",
  "reply": "Hai Dita! ...",
  "dispatched": true,
  "dryRun": true,
  "evaluation": { "overall": 8, "conversionLikelihood": 9 },
  "booking": { "intent": true, "status": "proposed" }
}
```

## Menghubungkan WhatsApp (Baileys)

1. Set `WA_TRANSPORT=baileys` dan `DRY_RUN=false` di `.env` (mulai dengan
   `DRY_RUN=true` dulu untuk mencoba tanpa benar-benar mengirim).
2. `npm run dev`.
3. QR muncul di terminal → buka WhatsApp → **Perangkat tertaut** → **Tautkan
   perangkat** → scan.
4. Sesi tersimpan di `WA_AUTH_DIR`, jadi tidak perlu scan ulang.
5. Karena ini WhatsApp Web (unofficial), gunakan nomor khusus/QnA dan patuhi
   ketentuan WhatsApp. Hanya pesan pribadi yang diproses (grup & status
   diabaikan).

## Dashboard Monitoring (shadcn/ui)

Console operasional untuk memantau lead, percakapan, dan kualitas agen. Dibangun
dengan **Next.js 16 + Tailwind v4 + shadcn/ui**, membaca REST API backend.

```bash
# terminal 1 — backend
npm run dev                  # http://localhost:4000

# terminal 2 — dashboard
npm run dashboard:dev        # http://localhost:3001
```

Dashboard kini **berpusat pada agent** (bukan sales): beranda = Control Room, dan
setiap agent punya menu dropdown yang bisa dibuka untuk melihat ringkasan,
aktivitas, dan data terkait. Status tiap agent dihitung dari job queue + event
log (endpoint `GET /agents/status`).

| Route | Isi |
| --- | --- |
| `/` | **Control Room** — alur end-to-end, grid 12 agent (status live), "butuh tindakan Anda", aktivitas terbaru |
| `/agents/[slug]` | **Detail agent** (supervisor, prospecting, sales, scoper, legal, intake, qa, handover, support, monitor, developer, content). Sales memuat tab **Kualitas / Booking / Workflow** |
| `/leads` · `/leads/[id]` | Lead + detail percakapan (data agent Sales) |
| `/projects` · `/invoices` | Proyek, PRD, dan invoice (Deal Desk) |
| `/tickets` | Tiket dukungan L1 (agent Support) |
| `/approvals` | Persetujuan human-in-the-loop — setujui/tolak dari dashboard |
| `/knowledge` | Knowledge base RAG (termasuk studi kasus flywheel) |
| `/pipeline` | Aktivitas global: job terjadwal + event |
| `/kualitas` · `/booking` · `/workflow` | Tetap ada, kini juga diakses lewat tab agent **Sales** |

Konfigurasi dashboard ada di `dashboard/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_REFRESH_MS=5000
```

Dashboard mem-*poll* API setiap 5 detik (indikator live di sidebar), jadi status
transport WhatsApp dan `DRY_RUN` selalu terlihat. Backend mengaktifkan CORS lewat
`CORS_ORIGIN` (default `*` untuk development). Build produksi: `npm run dashboard:build`.

## Office (Claw3D)

Kantor visual (control room) untuk melihat semua agent bekerja live dan **chat dengan
supervisor/agent**. Claw3D (Next.js) terhubung ke aplikasi ini lewat **gateway adapter**
WebSocket `claw3d/server/business-gateway-adapter.js` (port `18789`), yang membaca:

- `GET /agents/status` → roster + status live (agent menyala saat bekerja)
- `GET /agents/:slug/workflow` → riwayat pekerjaan per agent
- `POST /office/chat` → jawaban chat ringan (berdasarkan peran agent + papan proses
  bisnis + aktivitas terkini, via OpenRouter)

Jalankan:

```bash
# 1. Business API (wajib)
npm run dev                 # http://localhost:4000

# 2. Gateway adapter (jembatan ke office)
node claw3d/server/business-gateway-adapter.js   # ws://127.0.0.1:18789

# 3. Office
npm run claw3d:dev          # http://localhost:3000/office
```

> Di office, aktifkan floor yang menunjuk `ws://localhost:18789`. Buka chat agent
> (mis. **Supervisor**) untuk mengobrol. Chat memakai `POST /office/chat` sehingga
> responsif dan **tidak** membuat lead / mengirim WhatsApp.

## WhatsApp, Import Lead & Outreach

Tiga kemampuan operasional, semuanya bisa diatur dari halaman **Pengaturan**
di dashboard.

### 1. Hubungkan WhatsApp lewat QR

Buka **Pengaturan → Koneksi WhatsApp → Hubungkan**. QR muncul di kartu tersebut;
scan lewat WhatsApp → **Perangkat tertaut** → **Tautkan perangkat**. Status
diperbarui otomatis tiap 3 detik (endpoint `GET /whatsapp/status` dan SSE
`GET /whatsapp/events`). Tombol **Hapus Sesi** memunculkan QR baru.

> Menautkan WhatsApp bisa dilakukan walau `WA_TRANSPORT=console`; pesan keluar
> tetap dicetak ke log sampai Anda set `WA_TRANSPORT=baileys`.

### 2. Webhook lead (lead dari luar)

Kirim prospek dari sumber mana pun ke database, langsung masuk antrean outreach:

```bash
curl -X POST http://localhost:4000/webhook/leads \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"leads":[
    {"name":"Budi","phone":"081298765432","company":"CV Sinar Abadi",
     "source":"instagram","notes":"Order masih manual","queue":true}
  ]}'
```

- Menerima **3 bentuk**: objek tunggal, array, atau `{ "leads": [...] }`.
- **Alias field** (EN/ID): `nomor`/`whatsapp`/`no_hp` → `phone`, `nama` → `name`,
  `perusahaan` → `company`, `catatan`/`kebutuhan` → `notes`, dst.
- Validasi **error per-field** + mode `?dryRun=true` untuk uji tanpa menyimpan.
- Nomor dinormalisasi otomatis (`0812…` → `62812…`); dedup berdasarkan nomor.
- `queue: false` menyimpan lead tanpa memasukkannya ke antrean outreach.
- Spesifikasi mesin: `GET /webhook/leads/schema`.

📖 **Panduan lengkap + contoh cURL/JS/Python + format data tersimpan:
[`docs/WEBHOOK-LEADS.md`](docs/WEBHOOK-LEADS.md).**

### 3. Outreach otomatis (jam 08:00–17:00)

Penjadwal berjalan di dalam aplikasi dan **hanya** menghubungi prospek pada jam
kerja yang dikonfigurasi (`WORK_START_HOUR`–`WORK_END_HOUR`, `WORK_DAYS`,
`WORK_TIMEZONE`). Untuk setiap prospek yang jatuh tempo, Nadia menulis pesan
pembuka yang dipersonalisasi (nama, perusahaan, sumber, catatan) dan, jika belum
dibalas, satu pesan follow-up setelah `OUTREACH_FOLLOWUP_HOURS`.

- Prospek yang membalas **STOP** otomatis ditandai `opt_out` dan tidak pernah dihubungi lagi.
- Pembatas: `OUTREACH_BATCH` per tick, `OUTREACH_DELAY_MS` antar pesan, `OUTREACH_MAX_ATTEMPTS` percobaan.
- Selama `DRY_RUN=true`, pesan disusun tetapi tidak dikirim (dicatat sebagai `dry_run`).
- Uji manual kapan saja: tombol **Jalankan sekarang** di Pengaturan, atau
  `POST /outreach/tick` (tambahkan `?force=true` untuk mengabaikan jam kerja).

### Endpoint tambahan

| Method | Path | Fungsi |
| --- | --- | --- |
| `GET` | `/whatsapp/status` | Status koneksi + QR (data URL) |
| `GET` | `/whatsapp/events` | SSE perubahan status WhatsApp |
| `POST` | `/whatsapp/connect` \| `/disconnect` \| `/logout` | Kendali sesi WhatsApp |
| `POST` | `/webhook/leads` | Impor prospek (single/bulk) |
| `GET` | `/prospects` | Daftar prospek outbound |
| `GET` | `/outreach` | Statistik + log outreach |
| `POST` | `/outreach/tick` | Jalankan penjadwal once (`?force=true`) |
| `POST` | `/leads/:id/queue` \| `/opt-out` | Masukkan ke antrean / tandai opt-out |

## Penjadwalan Cal.com (MCP)Nadia tidak hanya mengirim link — ia bisa **mengecek slot kosong dan membuat
booking** langsung lewat Cal.com MCP server (`@calcom/cal-mcp`), dijembatani
`@langchain/mcp-adapters` di node `scheduling`.

Aktifkan dengan mengisi API key (tanpa key, scheduling otomatis nonaktif):

```bash
# .env
CAL_API_KEY=cal_live_xxxxxxxx     # Cal.com → Settings → Developer → API keys
# opsional
CAL_EVENT_TYPE_ID=12345           # paksa satu event type
CAL_TIMEZONE=Asia/Jakarta
CAL_SLOT_DAYS=7
```

Verifikasi koneksi dan lihat tool yang tersedia:

```bash
npm run cal:tools
```

Alur di dalam graph:

1. Node `scheduling` memanggil `getAvailableSlots` (atau `createBooking` bila
   prospek sudah memilih waktu dan email sudah diketahui).
2. Node `responseGeneration` menawarkan 2–3 slot nyata, atau mengonfirmasi
   booking beserta link Google Meet.
3. Node `bookingFlow` menyimpan hasilnya sebagai booking `confirmed`.

Catatan:

- Server MCP mengekspos **149 tool** dengan `--all-tools`; aplikasi hanya
  membuka 8 tool booking (`getAvailableSlots`, `createBooking`, `getEventTypes`,
  `getBooking`, `getBookings`, `rescheduleBooking`, `cancelBooking`,
  `getCalendarLinks`).
- `getAvailableSlots` hanya ada saat `CAL_MCP_ALL_TOOLS=true` (default).
- `createBooking` memerlukan **email attendee** — Nadia akan memintanya bila
  belum ada di percakapan.
- Tanpa `CAL_API_KEY`, node `scheduling` no-op dan agen kembali mengarahkan ke
  `BOOKING_LINK`.

### Klien MCP lain (Claude Desktop / Cursor / OpenCode)

Server yang sama bisa dipakai klien lain:

```json
{
  "mcpServers": {
    "calcom": {
      "command": "npx",
      "args": ["@calcom/cal-mcp@latest", "--all-tools"],
      "env": { "CAL_API_KEY": "cal_live_xxxxxxxx" }
    }
  }
}
```

## Struktur Proyek

```
sql/init.sql              Skema pgvector (knowledge, memory, leads, checkpoints…)
src/
  config/                 env (zod) + pino logger
  llm/                    client DeepSeek + structuredInvoke (fallback JSON)
  embedding/              provider hash / local / openai
  db/                     pool, schema, transaksi
  repository/             CRUD leads, conversations, evaluations, bookings
  memory/                 knowledge (RAG) + ltm (long-term memory)
  whatsapp/               transport, baileys, console
  graph/                  state, prompts, edges, nodes/, index (build), run
  supervisor/             orchestrator: agents, state, prompts, nodes/, index, run
  research/               Universal Research Engine (brief, state, nodes, run, workspace)
  prospecting/            Research Prospecting: Maps → enrich kontak → leads (D1)
  scout/                  Scout: pain-point & sudut outreach (D1)
  scoper/                 Scoper & PRD Builder: transkrip → PRD + checklist (F2)
  legal/                  Legal & Finance: PRD → SPK/NDA + invoice DP (F2)
  intake/                 Intake & Credential: vault akses terenkripsi (F2)
  qa/                     QA & Guardrail Tester (F3)
  scribe/                 Documentation & SOP Builder (F3)
  handover/               Handover & Final Invoice (F4)
  support/                L1 Support & Triage (F4)
  monitor/                Infrastructure & Cost Monitor (F4)
  developer/              Developer & Automation (D4) — engine OpenCode, tools GitHub
  content/                Case Study & Content Engine (F5)
  pipeline/               F0: jobs, events, approvals, scheduler, handlers (briefing)
  notifications/          notifikasi ke owner (WhatsApp)
  integrations/           klien eksternal: calcom, firecrawl, camoufox
  api/                    server Express
  seed/                   data knowledge + runner
  scripts/                simulate, reset-db
scripts/                  skrip Python (camoufox_fetch.py)
workspace/research/       laporan + evidence hasil riset (file)
dashboard/                UI monitoring (Next.js 16 + shadcn/ui)
  src/app/                halaman: ringkasan, leads, kualitas, booking
  src/components/         komponen UI + komponen data
  src/lib/                API client, SWR hooks, formatter
```

## Script

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Jalankan dengan watch (tsx) |
| `npm run build` / `npm start` | Build & jalankan versi terkompilasi |
| `npm run typecheck` | Type-check tanpa emit |
| `npm run seed` | Isi knowledge base (idempoten) |
| `npm run sim` | Simulasi percakapan end-to-end |
| `npm run cal:tools` | Tampilkan tool Cal.com MCP yang aktif |
| `npm run db:reset` | Drop semua tabel (app + checkpointer) |
| `docker compose up -d` / `down` | Nyalakan/hentikan Postgres+pgvector (+ proxy SearXNG) |

## Menyesuaikan

- **Ganti knowledge:** edit `src/seed/data.ts` lalu `npm run seed`, atau
  panggil `ingestKnowledge([...])` dari kode Anda.
- **Ubah persona/gaya bahasa:** `src/graph/prompts.ts`.
- **Tambah node:** buat file di `src/graph/nodes/`, daftarkan di
  `src/graph/index.ts`, tambahkan field terkait di `src/graph/state.ts`.
- **Ganti channel:** implementasikan interface `Transport`
  (`src/whatsapp/transport.ts`) — misalnya WhatsApp Cloud API resmi.

## Troubleshooting

| Gejala | Penyebab / solusi |
| --- | --- |
| `DEEPSEEK_API_KEY is not set` di `errors[]` | Isi `.env`. Node tetap fallback, tapi tanpa kualitas LLM |
| `useResponsesApi` → 404 dari DeepSeek | Jangan diubah; DeepSeek hanya mendukung Chat Completions |
| `Cannot open com.docker.service` | Jalankan Docker Desktop sebagai admin |
| Hasil retrieval kurang relevan | Pakai `EMBEDDING_PROVIDER=local` (butuh `npm i @huggingface/transformers`) |
| `column embedding is of type vector(384)` | Samakan `EMBEDDING_DIM` dengan dimensi kolom, lalu `npm run db:reset && npm run seed` |
