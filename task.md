# task.md — Pekerjaan yang Sudah Dikerjakan

> **Proyek:** AI Sales & Operations Agent — **PT Core Solution Digital**
> **Versi dokumen:** 1.0 · **Diperbarui:** 2026-10-07
> Status pekerjaan yang **sudah selesai** di repo ini, ditambah sisa pekerjaan (backlog).
> Legenda: ✅ selesai · 🟡 sebagian · ⬜ belum.

---

## 1. Ringkasan status

| # | Workstream | Status | Artefak utama |
| --- | --- | --- | --- |
| W1 | Fondasi backend & orkestrasi (F0) | ✅ | `src/pipeline/`, `sql/init.sql` |
| W2 | Sales Agent (Nadia) + LangGraph | ✅ | `src/graph/`, `src/supervisor/` |
| W3 | WhatsApp + media | ✅ | `src/whatsapp/`, `src/integrations/{whisper,vision}.ts` |
| W4 | Prospecting + Scout (D1) | ✅ | `src/prospecting/`, `src/scout/` |
| W5 | Scoper & PRD (D2) | ✅ | `src/scoper/` |
| W6 | Legal & Finance (D2) | ✅ | `src/legal/` |
| W7 | Intake & Credential (D2) | ✅ | `src/intake/`, `src/util/crypto.ts` |
| W8 | QA & Scribe (D3) | ✅ | `src/qa/`, `src/scribe/` |
| W9 | Handover, Support, Monitor (D4) | ✅ | `src/handover/`, `src/support/`, `src/monitor/` |
| W10 | Content & flywheel (D5) | ✅ | `src/content/`, `src/memory/knowledge.ts` |
| W11 | Supervisor penasihat + briefing | ✅ | `src/supervisor/`, `src/pipeline/handlers/briefing.ts` |
| W12 | Continuous improvement | ✅ | `src/improvement/`, tabel `agent_improvements` |
| W13 | Dashboard monitoring | ✅ | `dashboard/` (18 halaman) |
| W14 | Kantor 3D | ✅ | `the-delegation/` |
| W15 | Research Agent | ✅ | `src/research/` |
| W16 | Multi-provider LLM | ✅ | `src/llm/` |
| W17 | **Developer & Automation (D4)** | ✅ | `src/developer/`, `src/integrations/{opencode,github,devplatforms,cloudflareR2}.ts` |
| W18 | **Merge agent (ringkas)** | ✅ | `agentRegistry.ts`, dashboard, `the-delegation/` |

---

## 2. Detail per workstream

### W1 · Fondasi & orkestrasi (F0) ✅
- [x] Job queue + scheduler (`jobs.ts`, `scheduler.ts`, `repository.ts`, `registry.ts`)
- [x] Event log/outbox (`events.ts`)
- [x] Approval human-in-the-loop (`approvals.ts`) + perintah owner (`commands.ts`)
- [x] Entitas bisnis & lifecycle (`entities.ts`, `lifecycle.ts`, `projectContext.ts`)
- [x] Business Kanban (`businessBoard.ts`) + workflow agent (`agentWorkflow.ts`)
- [x] Skema DB lengkap & idempoten (`sql/init.sql`, `db/schema.ts`)
- [x] Handler job terpusat (`handlers/index.ts`, `handlers/briefing.ts`)
- [x] `markSystemBuilt()` jembatan "titik kerja owner" (`flow.ts`)

### W2 · Sales Agent + Supervisor ✅
- [x] Graph LangGraph 14 node + checkpointer Postgres (`graph/`)
- [x] Triage bot vs manusia, RAG, lead scoring 0–100, strategi, balasan
- [x] Outbound follow-up hanya jam kerja (`outreach/`)
- [x] Supervisor turn + advisory + profil owner (`supervisor/`)
- [x] Briefing harian + suggestion (`handlers/briefing.ts`, `supervisor/advisor.ts`)

### W3 · WhatsApp + media ✅
- [x] Baileys + transport console; dedup by `messageId`; antre per-kontak
- [x] Retry kirim (tunggu koneksi), typing indicator & pacing
- [x] Merge lead `@lid` → nomor (`mergeLeadByJid`)
- [x] Voice note → Whisper; gambar → DeepSeek vision

### W4 · Prospecting + Scout ✅
- [x] Scraping Google Maps + enrichment (Tavily)
- [x] Targeting niche "siap-AI/low-tech" + filter teknologi (`targeting.ts`)
- [x] Kuota harian + target per-lokasi (Batam, 20/hari)
- [x] Scout audit → pain-point & sudut outreach; gate `scouted_ready`
- [x] **Anti-duplikat**: lewati nomor (`wa_jid`) & bisnis (nama + alamat/situs); hitungan `duplicates` di progres Kanban & notifikasi owner — agar tiap hari fokus bisnis baru

### W5 · Scoper & PRD ✅
- [x] PRD 20 bagian + checklist teknis dari transkrip/meeting
- [x] Evaluasi & revisi otomatis (`SCOPER_EVAL_ENABLED`)
- [x] Loop pertanyaan terbuka → Sales (`clarify.ts`)
- [x] Dokumen PDF (pdfkit)

### W6 · Legal & Finance ✅
- [x] SPK + NDA + invoice DP; verifikasi DP (`invoice.dp_paid`)
- [x] Pelunasan → proyek `delivered` → Content + Developer

### W7 · Intake & Credential ✅
- [x] Link intake aman (token + expiry); form publik
- [x] Vault kredensial AES-256-GCM; kedaluwarsa otomatis

### W8 · QA & Scribe ✅
- [x] QA: webhook, JSON, guardrail → skor & keputusan lulus
- [x] Scribe: SOP + panduan setelah QA lulus

### W9 · Handover, Support, Monitor ✅
- [x] Handover: BAST + invoice pelunasan (approval)
- [x] L1 Support: triage, tiket, eskalasi (menjawab ke Sales)
- [x] Monitor: infra/biaya + kinerja agent (job gagal, rasio sukses, usulan)

### W10 · Content & flywheel ✅
- [x] Studi kasus anonim → knowledge base
- [x] Knowledge dipakai ulang Sales (RAG) & Scout

### W11 · Supervisor penasihat + briefing ✅
- [x] Chat owner ⇄ Supervisor (dashboard + WhatsApp) + memori (`supervisor_chat`)
- [x] Profil owner (`workspace/owner/profile.md`) dibaca saat memberi saran

### W12 · Continuous improvement ✅
- [x] Lesson otomatis per job (`agent_improvements`)
- [x] `agent.optimize` harian → usulan; approve → knowledge `playbook`
- [x] Papan Pertumbuhan (`/pertumbuhan`)

### W13 · Dashboard ✅
- [x] Control Room, alur & kanban bisnis, leads (+detail), projects (+detail),
      invoices, tickets, knowledge, pipeline/aktivitas, kualitas, pertumbuhan,
      supervisor, booking, operasional, pengaturan, approvals, workflow per agent

### W14 · Kantor 3D ✅
- [x] the-delegation: 14 workstation / 6 divisi; status live dari `/agents/status`
- [x] Menggantikan Claw3D (lama, tidak dipakai)

### W15 · Research Agent ✅
- [x] Planner → dual-engine ingestion (Firecrawl + Camoufox) → fakta → evaluator → formatter
- [x] Laporan & evidence tersimpan sebagai file

### W16 · Multi-provider LLM ✅
- [x] DeepSeek / Antigravity CLI / OpenRouter + rantai fallback + override per-node
- [x] `structuredInvoke` & `textInvoke`

### W17 · Developer & Automation (D4) ✅ — pekerjaan terbaru
**Tujuan:** menggantikan **Retainer**; mengelola situs terpasang (SEO/performa/keamanan)
& membangun otomasi/AI agent, dengan **OpenCode** sebagai engine dan **GitHub** sebagai
kanal perubahan, di balik **approval owner**.

- [x] Hapus modul `src/retainer/` dan seluruh referensinya
- [x] Tambah divisi **D4 · Client Success & Developer** & agent `developer` (registry)
- [x] Modul agent: `src/developer/{run,plan,repository,types}.ts`
- [x] Tabel baru **`dev_targets`** (`sql/init.sql`) + repository
- [x] Audit target: SEO (title/meta/sitemap/robots/HTTPS), platform, repo
- [x] Perencana LLM (`buildDevPlan`) + fallback heuristik + `PLAN.md`
- [x] Integrasi engine **OpenCode**: `integrations/opencode.ts` (headless, parser JSONL,
      resolve `.exe` agar aman di Windows)
- [x] Integrasi **GitHub**: `integrations/github.ts` (`gh`+git: clone/branch/commit/push/PR,
      `gh auth setup-git`)
- [x] Platform developer: `integrations/devplatforms.ts` (Vercel, Cloudflare, Supabase,
      Search Console, Analytics; aktif bila token diisi)
- [x] **Cloudflare R2 (S3-compatible)**: `integrations/cloudflareR2.ts` — list/put/get/delete
      objek memakai AWS SigV4 sendiri (tanpa dependensi); env `CLOUDFLARE_R2_ACCESS_KEY_ID`,
      `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_BUCKET`,
      `CLOUDFLARE_R2_PUBLIC_URL`
- [x] Job baru: `developer.maintain`, `developer.build`, `developer.sweep`,
      `developer.apply`, `developer.deploy`
- [x] Trigger otomatis saat `invoice.final_paid` (`legal/run.ts`)
- [x] **Approval → job lanjutan**: `developer.apply`/`developer.deploy` dieksekusi
      otomatis setelah disetujui (`pipeline/approvals.ts`)
- [x] Jadwal harian `developer.sweep` 11:00 (`pipeline/scheduler.ts`)
- [x] Endpoint: `/developer/platforms`, `/developer/targets` (GET/POST),
      `/developer/:projectId`, `/developer/build`, `/developer/apply`; status engine di `/llm/status`
- [x] Perintah owner: `MAINTAIN <projectId>`, `DEV <deskripsi>`
- [x] **Bot Telegram khusus Developer**: approval `developer.*` dikirim via bot terpisah
      (`DEVELOPER_TELEGRAM_BOT_TOKEN`+`DEVELOPER_TELEGRAM_CHAT_ID`) dengan tombol Setujui/Tolak;
      hook di `requestApproval`, start/stop di `runtime.ts`
- [x] Bisnis/kanban/experience & kantor 3D diperbarui (retainer → developer)
- [x] Dokumentasi: `docs/{AGENTS,ARSITEKTUR,FLOW}.md`, `README.md`, `.env.example`, `memory.md`
- [x] `requirements.md`, `design.md`, `task.md` (dokumen ini)

### W18 · Merge agent (ringkas) ✅
**Tujuan:** mengurangi jumlah agent tanpa menghilangkan fungsi.

- [x] **`prospecting` + `scout` → Research & Scout** (D1): entri agent digabung;
      job `scout.audit`/`scout.daily` & event `prospect.scouted`/`lead.scouted_ready`
      kini milik `prospecting`. Modul `src/scout/` tetap.
- [x] **`qa` + `scribe` → QA & Documentation** (D3): job `scribe.docs` & event `docs.ready`
      kini milik `qa`. Modul `src/scribe/` tetap.
- [x] `AGENT_HANDOFFS` disesuaikan (prospecting→sales, qa→handover).
- [x] Kanban bisnis: kolom `Prospek` & `QA & Dokumen`, label agent, dan steps menyesuaikan.
- [x] Workflow (topologi): node `scout` & `scribe` dilebur; edge `prospecting→sales`,
      `qa→handover`; fase "Penjualan"/"Serah terima" diperbarui.
- [x] Dashboard agent-experience & operasional: entri digabung.
- [x] Office 3D: roster 14 → **12** workstation; `AGENT_SLUGS/ROLES/COLORS/OFFICE_DIVISIONS` disesuaikan.
- [x] Docs diperbarui: `docs/{AGENTS,FLOW,ARSITEKTUR}.md`, `README.md`, `memory.md`,
      `design.md`, `the-delegation/{LOCAL-OFFICE,CONNECT-AGENTS}.md`.
- [x] Typecheck backend, dashboard, dan the-delegation — lulus.

> **Catatan:** merge dilakukan di **lapisan organisasi/registry**; modul kode & tipe job
> tidak berubah sehingga logika dan riwayat tetap utuh. Rencana lanjutan (opsional):
> `scoper`+`legal`+`intake` → Deal Desk, dan `handover`+`support`+`monitor` → Client Success.

---

## 3. Jadwal terjadwal (scheduler)

| Jam (Asia/Jakarta) | Job | Status |
| --- | --- | --- |
| 03:00 | `intake.expire` | ✅ |
| 07:00 | `agent.optimize` | ✅ |
| 08:00 | `briefing` (+ `monitor.check`, `supervisor.review`) | ✅ |
| 09:00 | `prospecting.daily` | ✅ |
| 10:00 | `scout.daily` | ✅ |
| 11:00 | `developer.sweep` | ✅ |
| 08:00–17:00 (Sen–Jum) | outreach tick | ✅ |

---

## 4. Verifikasi yang sudah dilakukan

- [x] `npm run typecheck` (backend) — lulus
- [x] `npx tsc --noEmit` di `dashboard/` — lulus
- [x] `npx tsc --noEmit` di `the-delegation/` — lulus
- [x] `npx pm2 restart nadia-api-dev` — boot bersih, skema `dev_targets` terbentuk
- [x] `GET /health` → `ok: true`
- [x] `GET /llm/status` → `developer.opencodeAvailable: true`
- [x] `GET /developer/platforms` → **GitHub** configured (`gh login: envexx`)
- [x] `GET /agents` → agent `developer` terdaftar di D4

---

## 5. Item terbuka / backlog

### Developer (lanjutan)
- ⬜ Set `DEVELOPER_OPENCODE_MODEL` ke model OpenCode berkredit (mis. `deepseek/deepseek-chat`)
      — default OpenCode saat ini mengarah ke OpenRouter tanpa kredit (402).
- ⬜ Isi token platform agar aksi otomatis aktif: `VERCEL_TOKEN`/`VERCEL_DEPLOY_HOOK_URL`,
      `CLOUDFLARE_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `PLAUSIBLE_*`.
- ⬜ Uji end-to-end 1 siklus `developer.build`/`maintain` nyata (clone → OpenCode → PR).
- ⬜ OAuth Google Search Console (submit sitemap/inspeksi indexing).
- ⬜ Batas ukuran PR + test runner otomatis sebelum PR.

### Pipeline & dokumen
- ⬜ Rantai `scoper.prd` → `legal.draft` belum otomatis.
- ⬜ Tools dokumen: perluas ke Legal (SPK/NDA/invoice), Handover (BAST), Scribe (SOP).
- ⬜ Payment gateway (DP/pelunasan) masih manual.
- ⬜ E-signature, email, Google Maps API resmi, publishing konten (belum ada).
- ⬜ Batas putaran loop klarifikasi Scoper.

### Kualitas & kanal
- ⬜ Evaluasi kualitas untuk agent selain Sales/QA.
- ⬜ Perbaiki auth Cal.com MCP (401) → aktifkan penjadwalan slot.
- ⬜ Isi `OWNER_WA_JID` agar notifikasi WhatsApp owner aktif (Telegram sudah aktif).

---

## 6. Catatan operasional

- Setelah mengubah kode: **`npx pm2 restart nadia-api-dev`** (PM2 tidak hot-reload).
- Dashboard: `npm run dashboard:dev` → http://localhost:3001.
- Office 3D: http://127.0.0.1:3005/the-delegation/.
- Uji tanpa kirim WhatsApp asli: set `DRY_RUN=true`.
- Jangan commit `.env`. Simpan daftar PM2: `npx pm2 save`.
