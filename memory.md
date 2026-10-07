# memory.md — Konteks Proyek untuk Agent Berikutnya

> Dokumen ini untuk **agent AI berikutnya** (atau developer) agar cepat paham proyek
> ini: apa isinya, bagaimana menjalankannya, di mana hal-hal penting berada, dan
> jebakan yang sudah diketahui. Terakhir diperbarui: 2026-10-07.

---

## 1. Apa ini

**AI Sales & Operations Agent** — sistem otomasi berbasis banyak agent (multi-agent)
untuk bisnis jasa digital/AI **PT Core Solution Digital**. Agen WhatsApp bernama
**Nadia** (Sales) melayani prospek; di belakangnya ada pipeline agent (riset prospek →
scout → sales → scoper → legal → intake → pembangunan → QA → dokumen → serah terima →
developer/content).

- Bahasa dominan: **Indonesia**.
- Orkestrasi: **LangGraph.js** + state machine; job queue + scheduler internal.
- LLM: **DeepSeek** (default), **Antigravity CLI** (`agy`), **OpenRouter** (model gratis) dengan rantai fallback.
- WhatsApp: **Baileys** (unofficial) + transport `console` untuk dev.
- Storage: **Postgres 16 + pgvector** (RAG, memory, checkpointer).
- Dashboard: **Next.js 16 + shadcn/ui**.
- Office visual (kantor 3D): **the-delegation** (Vite + Three.js).

Struktur repo (sekunder penting):
```
src/            backend (agent, graph, pipeline, api, integrations)
dashboard/      UI monitoring (Next.js)
the-delegation/ office 3D (Vite)  ← pengganti Claw3D
claw3d/         (LAMA, tidak dipakai lagi; PM2 sudah dihapus)
sql/init.sql    skema DB (dijalankan otomatis saat boot)
workspace/      output file (projects, research, prospecting, owner)
docs/           dokumentasi konsep (FLOW, AGENTS, PROSPECTING, dll)
scripts/        launcher PM2 + jembatan Python (whisper)
logs/           log PM2 lama
```

---

## 2. Cara menjalankan (PENTING)

Sistem dijalankan lewat **PM2** (auto-restart). Saat ini:

| App PM2 | Fungsi | Port |
| --- | --- | --- |
| `nadia-api-dev` | Backend API + transport WA + semua scheduler | **4000** |
| `delegation-office` | Office 3D (the-delegation) | **3005** |

Perintah umum:
```bash
npx pm2 list                 # status
npx pm2 restart nadia-api-dev   # WAJIB setelah mengubah kode (PM2 tidak watch)
npx pm2 logs nadia-api-dev      # lihat log
npx pm2 save                    # simpan daftar
```
- Entry backend dev: `scripts/api-dev.cjs` → menjalankan `tsx .playwright-cli/ui-api.ts`.
  (`src/index.ts` = entry produksi; `npm run dev` = `tsx watch src/index.ts`.)
- **`.playwright-cli/ui-api.ts`** hanya membungkus `createServer()`+`startRuntime()` di port 4000.
- **Runtime lengkap** (WA transport, outreach/pipeline scheduler, telegram) ada di
  `src/runtime.ts` (`startRuntime()`), dipakai oleh `src/index.ts` dan `ui-api.ts`.
- **Dashboard** (bukan PM2): jalankan `npm run dashboard:dev` → http://localhost:3001.
- **Office**: http://127.0.0.1:3005/the-delegation/ (`scripts/delegation-dev.cjs`).

Prasyarat: Docker (Postgres `sales-pgvector`), `npm install`, `.env` terisi
(lihat bagian 8). Seed knowledge: `npm run seed`.

---

## 3. Peta backend (di mana apa)

```
src/config/env.ts        Skema env (zod) — semua variabel
src/runtime.ts           Boot runtime (WA, schedulers) dipakai index.ts & ui-api.ts
src/api/server.ts        Semua endpoint HTTP (Express)
src/whatsapp/            service.ts (Baileys: dedup, antre per-kontak, media), outbound.ts (retry)
src/graph/               Sales (Nadia): nodes/, state, edges, index (build graph), run.ts
src/supervisor/          run.ts (entry turn + owner), advisor.ts (penasihat), profile.ts, report.ts
src/pipeline/            jobs.ts (eksekusi job + catat pelajaran), scheduler.ts, handlers/, repository.ts,
                         businessBoard.ts (kanban), agentRegistry.ts, commands.ts (perintah owner), flow.ts
src/improvement/         repository.ts (growth + lessons/suggestions), optimize.ts (agent.optimize)
src/prospecting/         run.ts, live.ts (job live), targeting.ts (katalog niche + filter teknologi)
src/scout/index.ts       audit pain-point
src/scoper/              run.ts (PRD + evaluasi + PDF), prompts.ts, types.ts, clarify.ts (loop ke Sales)
src/legal|intake|qa|scribe|handover|support|monitor|content/  agent F2–F5
src/developer/           Developer & Automation (D4) — engine OpenCode + tools GitHub/Vercel/Cloudflare/Supabase (pengganti retainer) · desain: docs/DEVELOPER.md
src/integrations/        tavily.ts, vision.ts (DeepSeek gambar), whisper.ts, pdf.ts (pdfkit), firecrawl.ts, maps.ts, camoufox.ts, calcom.ts, telegram.ts
src/memory/              knowledge.ts (RAG), ltm.ts (long-term memory)
src/llm/index.ts         Provider (deepseek|antigravity|openrouter) + fallback chain + structured output
```

**12 agent** (registry `src/pipeline/agentRegistry.ts`):
`supervisor, prospecting (Research & Scout), sales, scoper, legal, intake, qa (QA & Documentation), handover, support, monitor, developer, content`.
> Gabungan terbaru: `prospecting`+`scout` → **Research & Scout**; `qa`+`scribe` → **QA & Documentation**
> (modul `src/scout/`, `src/scribe/` & job `scout.*`, `scribe.docs` tetap ada; yang menyatu hanya entri agent).

---

## 4. Konsep inti

- **Alur bisnis**: prospecting → scout → sales → (booking) → scoper (PRD) → legal →
  intake → [Anda bangun] → qa → scribe → handover → content + developer (maintain
  situs & bangun otomasi/AI agent lewat OpenCode).
- **Gate**: prospek hanya diproses Sales bila `readiness=scouted_ready` (hasil Scout).
- **Media masuk**: voice note → transkrip lokal (faster-whisper), gambar → deskripsi (DeepSeek vision).
- **Anti balasan dobel**: dedup by `messageId` + antre per-kontak (`wa:service`).
- **Anti-duplikat lead** (Riset): sebelum menyimpan, cek **nomor** (`wa_jid`) dan **bisnis**
  (nama + alamat/situs via `findProspectByBusiness`); yang sudah ada **dilewati** (tidak
  di-update/di-antre ulang, tanpa `scout.audit` baru). Field `duplicates` muncul di hasil run,
  progres Kanban, dan notifikasi owner. Tujuan: tiap hari fokus **mencari bisnis baru**, tidak
  terjebak mengulang data lama (loop target harian lanjut ke niche berikutnya, dan
  **titik awal niche dirotasi harian** agar cakupan bisnis baru makin luas).
- **Balasan gagal** dicoba ulang (tunggu koneksi + retry).
- **Sapaan sekali/hari**: `lead.meta.lastGreetedOn` (zona `Asia/Jakarta`);
  hari sama → tanpa sapaan, beda hari → menyapa lagi.
- **@lid vs nomor**: balasan WhatsApp sering datang sebagai `@lid`. Sistem memakai
  `senderPn` (nomor) sebagai identitas lead + **merge** lead `@lid` lama (`mergeLeadByJid`).

---

## 5. Continuous improvement (agent makin baik)

- **Pelajaran otomatis**: setiap job selesai/gagal dicatat di tabel `agent_improvements`
  (kind=`lesson`) oleh `src/pipeline/jobs.ts`.
- **Loop perbaikan** `agent.optimize` (harian 07:00): menganalisis kinerja + pelajaran →
  menghasilkan `suggestion` (status `proposed`) → notifikasi owner.
  Disetujui → otomatis **masuk Knowledge (category `playbook`)** → dipakai agen via RAG.
- **Papan Pertumbuhan**: `GET /agents/growth` + halaman dashboard `/pertumbuhan`
  (tren, rasio sukses, pelajaran, usulan + tombol Setujui/Tolak + "Jalankan analisis").
- **Monitor (fungsi ganda)**: `src/monitor/run.ts` memantau **infra/biaya + kinerja agent**
  (job gagal, rasio sukses, antrean, usulan menunggu). Workflow menggambarkannya
  (`dashboard/src/lib/business-topology.ts`, fase "Pemantauan & perbaikan").

---

## 6. Supervisor sebagai penasihat

- **Berkomunikasi dua arah** dengan owner:
  - Dashboard halaman **`/supervisor`** (chat + editor "Tujuan & profil saya").
  - WhatsApp: pesan bebas dari owner → dijawab Supervisor (`src/supervisor/run.ts`).
  - Endpoint: `GET|POST /supervisor/chat`, `GET|PUT /supervisor/profile`.
- **Profil owner**: `workspace/owner/profile.md` (tujuan, prioritas, batasan) — dibaca
  setiap memberi saran (`src/supervisor/advisor.ts`).
- **Briefing harian** (08:00): aktivitas tiap agent + kendala + **saran**. Dikirim ke
  Telegram/WhatsApp (`notifyOwner`).
- **Supervisor V2** (lihat `docs/SUPERVISOR.md`): tugasnya **memantau alur kerja semua
  agent**, memberi **saran & kritik per agent**, **mengusulkan perbaikan/pembaruan
  (fitur/teknologi) dengan Tujuan & Dampak**, menjaga **koordinasi/struktur alur**, dan
  **laporan bahasa awam**. Job `supervisor.review` → `runSupervisorReview()`
  (`src/supervisor/review.ts`): simpan saran/usulan ke `agent_improvements`
  (`suggestion`/`proposed`, dedup) + ringkasan ke owner.

---

## 7. Notifikasi (owner)

`src/notifications/index.ts` → `notifyOwner()` mengirim ke **WhatsApp** (bila `OWNER_WA_JID`)
dan/atau **Telegram** (bila `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OWNER_CHAT_ID`).
- Telegram aktif: bot **@managercrew_bot**, `TELEGRAM_OWNER_CHAT_ID` terisi.
- `TELEGRAM_ENABLED=false` hanya mematikan **bot kanal klien L1**; notifikasi owner tetap jalan.
- Cari Chat ID: kirim pesan ke bot → `GET /telegram/chats`.
- **Bot Developer** (terpisah): approval `developer.*` dikirim via bot Telegram tersendiri
  (`DEVELOPER_TELEGRAM_BOT_TOKEN` + `DEVELOPER_TELEGRAM_CHAT_ID`) dengan tombol **Setujui/Tolak**,
  atau balas `APPROVE <id>` / `REJECT <id>`. Lihat `src/developer/telegram.ts`.

Jadwal penting (Asia/Jakarta): `intake.expire` 03:00 · `agent.optimize` 07:00 ·
`briefing` 08:00 (+ memicu `monitor.check` & `supervisor.review`) · `prospecting.daily` 09:00 ·
`scout.daily` 10:00 · outreach otomatis 08:00–17:00 (hari kerja).

---

## 8. Konfigurasi (.env)

`.env` sudah **lengkap** (sinkron dengan `.env.example`). Nilai penting saat ini:
- `DATABASE_URL=postgres://sales:sales@localhost:5432/sales`
- `WA_TRANSPORT=baileys`, `DRY_RUN=false` (hati-hati: mengirim WhatsApp asli!), `WA_AUTO_CONNECT=true`
- `LLM_PROVIDER=antigravity`, `LLM_FALLBACK_PROVIDERS=openrouter,deepseek`
- `LLM_PROVIDER_OVERRIDES=...` (banyak node diarahkan ke `openrouter` untuk kecepatan)
- Integrasi: `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `TAVILY_API_KEY`, `CAL_API_KEY`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`
- Media: `MEDIA_ENABLED`, `WHISPER_ENABLED/WHISPER_MODEL=small/WHISPER_LANGUAGE=id`, `VISION_ENABLED`
- Prospecting fokus **Batam**, target **20 lead/hari** (`PROSPECTING_LOCATION=Batam`,
  `PROSPECTING_DAILY_TARGET=20`), kuota Scout 40.
- Scoper: `SCOPER_EVAL_ENABLED=true`, `SCOPER_EVAL_MIN=7`, `SCOPER_MAX_REVISIONS=1`
- Keandalan kirim: `WA_SEND_CONNECT_TIMEOUT_MS`, `WA_SEND_RETRIES`, `WA_SEND_RETRY_MS`
- Developer (D4): `DEVELOPER_ENABLED`, engine OpenCode `DEVELOPER_OPENCODE_BIN=opencode`
  + `DEVELOPER_OPENCODE_MODEL` (kosong = default; **isi model berkredit**, mis. `deepseek/deepseek-chat`),
  workspace `./workspace/developer`, `DEVELOPER_SWEEP_HOUR=11`. Token platform opsional:
  `VERCEL_TOKEN`/`VERCEL_DEPLOY_HOOK_URL`, `CLOUDFLARE_API_TOKEN`+`CLOUDFLARE_ACCOUNT_ID`,
  Cloudflare R2 `CLOUDFLARE_R2_ACCESS_KEY_ID`/`CLOUDFLARE_R2_SECRET_ACCESS_KEY`/`CLOUDFLARE_R2_ENDPOINT`/`CLOUDFLARE_R2_BUCKET`,
  `SUPABASE_ACCESS_TOKEN`, `SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON`, `PLAUSIBLE_API_TOKEN`+`PLAUSIBLE_SITE_ID`. GitHub memakai `gh` login.

⚠️ **Jangan commit `.env`** (berisi kunci). Ada backup `\.env.bak`.

---

## 9. Tabel DB tambahan (baru)

- `agent_improvements` — pelajaran & usulan per agent (continuous improvement).
- `supervisor_chat` — riwayat obrolan owner ⇄ Supervisor.
- `dev_targets` — situs/repo/otomasi yang dikelola agent Developer (audit + deploy).
(Skema lain: `leads, conversations, knowledge_docs, long_term_memory, evaluations,
bookings, projects, clients, invoices, jobs, events, approvals, tickets, credentials,
client_channels, research_reports, meeting_notes, intake_links`.)

---

## 10. Endpoint penting (ringkas)

```
GET  /health                          status transport, dryRun, provider
POST /simulate                        uji turn (tanpa API key) — {from,name,text}
GET  /leads · /leads/:id              lead + transkrip
GET  /business/board                  data Business Kanban
POST /prospecting/daily               kejar target lead harian (Batam)
GET  /prospecting/niches              katalog niche target
POST /prospecting/targeted            1 putaran tepat sasaran
POST /scoper                          buat/perbarui PRD (body {leadId, projectId?})
GET  /agents/growth                   KPI & tren per agent
POST /agents/optimize                 loop usulan perbaikan
GET  /improvements · POST /improvements/:id/approve|reject
GET|POST /supervisor/chat             obrolan Supervisor
GET|PUT  /supervisor/profile          profil/tujuan owner
GET  /telegram/chats                  temukan Chat ID owner
POST /briefing/run                    pemicu briefing manual
GET  /developer/platforms             kesiapan platform (GitHub/Vercel/Cloudflare/Supabase/SEO/Analytics)
GET  /developer/cloudflare/zones      daftar zona Cloudflare
GET  /developer/cloudflare/r2/objects daftar objek Cloudflare R2 (S3)
GET|POST|DELETE /developer/cloudflare/r2/object  ambil/unggah/hapus objek R2
GET  /developer/targets               daftar target developer (situs/repo/otomasi)
POST /developer/:projectId            audit situs & susun rencana (developer.maintain)
POST /developer/build                 rencanakan otomasi/AI agent baru {title, brief}
POST /developer/apply                 jalankan perubahan via OpenCode → PR (butuh approval)
```

---

## 11. Jebakan yang sudah diketahui (pelajari!)

1. **Setelah edit kode → `npx pm2 restart nadia-api-dev`** (PM2 tidak hot-reload). `tsx watch`
   tidak dipakai di PM2.
2. **`tsx` mengabaikan folder ber-titik** (`.playwright-cli/`) → edit di sana tidak memicu watch.
3. **Model gratis OpenRouter punya limit harian** (`429 free-models-per-day`). Fallback ke
   DeepSeek otomatis. Bila lambat → tambah kredit OpenRouter atau kurangi override `openrouter`.
4. **Schema PRD besar** → set `maxTokens` (Scoper pakai 8000) agar JSON tidak terpotong.
5. **Handler `scoper.prd` harus meneruskan `projectId`** (sudah diperbaiki) — bila lupa,
   update PRD akan membuat proyek baru.
6. **Cal.com MCP gagal auth (401)** → penjadwalan slot tidak aktif (`CAL_API_KEY` /
   `CAL_MCP_URL` perlu diperbaiki/OAuth).
7. **`DRY_RUN=true`** saat uji agar tidak mengirim WhatsApp asli; ingat kembalikan ke `false`.
8. **Jangan panggil `GET /telegram/chats`** berulang cepat; Telegram `getUpdates` perlu pesan baru.
9. Nomor owner WhatsApp (`OWNER_WA_JID`) masih kosong → notifikasi via WhatsApp belum terkirim
   (Telegram sudah aktif).

---

## 12. Riwayat perubahan besar (sesi terakhir)

- **Tavily** sebagai fungsi tambahan prospecting (search + extract) + provider discovery.
- **Targeting prospek**: katalog niche "siapa-AI/low-tech", filter bisnis teknologi,
  target harian per-lokasi; endpoint `/prospecting/niches|targeted|daily`.
- **OpenRouter** provider + rantai fallback (banyak node di-override ke openrouter).
- **Kanban live + progres**: run API menampilkan kartu live; job live pakai tipe
  `prospecting.live` (bukan `prospecting.scan`) agar tidak dijalankan ulang scheduler.
- **Office** diganti dari Claw3D → **the-delegation**; office menyambung ke backend
  (`/agents/status`) dan menampilkan agent bekerja vs istirahat + loop pembelajaran.
- **Scout → Sales**: hasil Scout (pain-point, offering, approach) kini dipakai Sales (RAG)
  & outreach + tampil di detail Lead; anti-halusinasi.
- **Media**: voice note → Whisper lokal; gambar → DeepSeek vision.
- **Dedup pesan + antre per-kontak + retry kirim**.
- **Telegram** untuk laporan/alert owner.
- **Continuous improvement** (`agent_improvements`, `agent.optimize`, `/pertumbuhan`, approve→knowledge).
- **Monitor fungsi ganda** (infra + kinerja agent) + workflow-nya.
- **Supervisor penasihat** (chat + profil owner + memory).
- **Scoper**: PRD ala `prd-skill` (20 bagian), evaluasi+revisi, PDF (pdfkit),
  loop pertanyaan terbuka → Sales tanya klien → PRD diperbarui.
- **Sapaan sekali/hari** untuk Sales.
- **Developer (D4)** menggantikan **Retainer**: audit situs/repo (SEO/performa/keamanan) + bangun
  otomasi/AI agent. Engine **OpenCode** (`opencode run`, parsing JSONL), tools **GitHub** (`gh`+git),
  Vercel/Cloudflare/Supabase/Search Console/Analytics. Push & deploy lewat **persetujuan owner**
  (`developer.apply`/`developer.deploy` → job lanjutan otomatis). Tabel `dev_targets`.
- **Developer Internal (full-auto)**: target repo sendiri (`DEVELOPER_INTERNAL_REPO`/`_LOCAL`);
  `developer.build` scope internal → auto `developer.apply`. Guardrail (`src/developer/guardrails.ts`):
  `src/developer|supervisor|monitor`, `.env`, dsb **dilarang**; Sales butuh approval; wajib `tsc` lulus;
  backup branch untuk rollback; tulis `requirement.md`/`design.md`/`task.md` di workspace. Pemicu:
  approve usulan Pertumbuhan (`evidence.kind="proposal"`) → `developer.build` internal.
  Bot Telegram khusus approval (`DEVELOPER_TELEGRAM_BOT_TOKEN`+`_CHAT_ID`, tombol Setujui/Tolak).
- **Merge agent (ringkas)**: `prospecting`+`scout` → **Research & Scout**; `qa`+`scribe` → **QA & Documentation**.
  Roster **14 → 12**; entri agent menyatu, modul & job type tetap. Dashboard (topologi workflow,
  kanban, agent-experience) dan office 3D (the-delegation) ikut diperbarui.

---

## 13. Item terbuka / saran lanjutan

- **Rantai putus**: `scoper.prd` → **legal.draft** belum otomatis (legal masih manual/API).
- **Tools dokumen**: baru PDF Scoper; perluas ke Legal (SPK/NDA/invoice), Handover (BAST), Scribe (SOP).
- **Payment gateway** (DP/pelunasan) masih ditandai manual.
- **E-signature**, **email**, **Google Maps API resmi**, **publishing** (content) belum ada.
- **Batas putaran** loop klarifikasi Scoper (agar tidak bertanya terus).
- **Evaluasi kualitas** untuk agent selain Sales/QA.

---

## 14. Konvensi & hal yang diharapkan

- Kode TypeScript ESM (`NodeNext`), `import ... from "./x.js"` (pakai `.js`).
- Jalankan `npm run typecheck` sebelum menandai selesai.
- `structuredInvoke`/`textInvoke` (`src/llm/index.ts`) mendukung `name` (untuk override),
  `provider`, `maxTokens`, dan rantai fallback.
- Untuk aksi yang mengirim WhatsApp nyata, uji dengan `DRY_RUN=true` lebih dulu.
- Dokumentasi konsep ada di `docs/` (FLOW.md, AGENTS.md, PROSPECTING.md, SUPERVISOR.md,
  LLM-PROVIDERS.md, RESEARCH.md, PIPELINE-F0.md).
