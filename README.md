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

- **LangGraph state machine** — 14 node dengan checkpointer Postgres (memori percakapan lintas-turn)
- **Triage bot vs manusia** — 11 pola regex heuristik, LLM fail-open
- **RAG + long-term memory** — pgvector untuk knowledge base dan feedback loop refleksi
- **Lead scoring 0–100** (heuristik + LLM) → segmen Nurture / Objection / Closing
- **Balasan WhatsApp yang manusiawi** — typing indicator, jeda sesuai panjang teks, read receipt
- **Penjadwalan Cal.com via MCP** — cek slot kosong dan buat booking langsung
- **Outreach otomatis** — hanya jam kerja, batch + jeda, opt-out otomatis saat prospek balas STOP
- **Webhook lead** — 3 bentuk body, alias field ID/EN, validasi per-field → [`docs/WEBHOOK-LEADS.md`](docs/WEBHOOK-LEADS.md)
- **Dashboard Next.js 16 + shadcn/ui** — 6 halaman, status WhatsApp live via SSE

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
    webhook["WhatsApp Webhook"] --> triage["AI Triage / Bot Detection"]
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

# 2. Nyalakan Postgres + pgvector
docker compose up -d db

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
curl -X POST http://localhost:3000/simulate ^
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
| `DATABASE_URL` | `postgres://sales:sales@localhost:5432/sales` | Postgres |
| `EMBEDDING_PROVIDER` | `hash` | `hash` \| `local` \| `openai` |
| `EMBEDDING_DIM` | `384` | Harus cocok dengan `vector(384)` |
| `WA_TRANSPORT` | `console` | `console` (dev) \| `baileys` |
| `WA_AUTH_DIR` | `./baileys_auth` | Folder sesi Baileys |
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
npm run dev                  # http://localhost:3000

# terminal 2 — dashboard
npm run dashboard:dev        # http://localhost:3001
```

Halaman:

| Route | Isi |
| --- | --- |
| `/` | Statistik ringkas, **pipeline per segmen**, volume lead 14 hari, evaluasi terbaru |
| `/leads` | Tabel lead dengan pencarian, filter segmen, dan pengurutan |
| `/leads/[id]` | Detail lead: transkrip WhatsApp, skor, penilaian, dan booking |
| `/kualitas` | Radar kualitas rata-rata + daftar kritik agen |
| `/booking` | Kartu booking & follow-up |

Konfigurasi dashboard ada di `dashboard/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_REFRESH_MS=5000
```

Dashboard mem-*poll* API setiap 5 detik (indikator live di sidebar), jadi status
transport WhatsApp dan `DRY_RUN` selalu terlihat. Backend mengaktifkan CORS lewat
`CORS_ORIGIN` (default `*` untuk development). Build produksi: `npm run dashboard:build`.

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
curl -X POST http://localhost:3000/webhook/leads \
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
  api/                    server Express
  seed/                   data knowledge + runner
  scripts/                simulate, reset-db
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
| `docker compose up -d db` / `down` | Nyalakan/hentikan Postgres+pgvector |

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
