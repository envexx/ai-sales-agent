# requirements.md — Kebutuhan Sistem

> **Proyek:** AI Sales & Operations Agent — **PT Core Solution Digital**
> **Versi dokumen:** 1.0 · **Diperbarui:** 2026-10-07
> **Status:** mencerminkan implementasi yang **sudah dikerjakan** di repo ini.

---

## 1. Latar belakang & tujuan

PT Core Solution Digital menjual jasa digital/AI (custom web app, otomasi, AI agent,
integrasi sistem) ke bisnis UKM. Penjualan & operasional masih manual. Tujuan sistem:

1. **Melayani prospek WhatsApp secara otomatis** lewat agen **Nadia** (Sales), tanpa
   kehilangan sentuhan manusia pada keputusan penting.
2. **Menjalankan pipeline bisnis end-to-end** dari pencarian prospek sampai serah
   terima dan pemeliharaan, lewat banyak agent yang terspesialisasi.
3. **Menjaga owner tetap memegang kendali** — aksi berisiko (kirim ke klien, push
   kode, deploy) berjalan hanya setelah persetujuan (human-in-the-loop).
4. **Membuat agent makin baik dari waktu ke waktu** (continuous improvement).
5. **Mengelola & meningkatkan aset digital** (situs yang sudah dibangun) serta
   **membangun otomasi/AI agent baru** lewat agen Developer.

## 2. Aktor / pengguna

| Aktor | Deskripsi | Kanal |
| --- | --- | --- |
| **Owner** | Pemilik/operator (Anda). Memutuskan approval, menerima briefing/alert. | WhatsApp owner, Telegram, dashboard |
| **Prospek / Lead** | Calon klien (inbound atau hasil prospecting). | WhatsApp |
| **Klien** | Prospek yang menang & punya proyek. | WhatsApp (via Sales), dashboard |
| **Operator/Owner dev** | Menjalankan PM2, mengedit `.env`, membangun sistem klien. | CLI/PM2 |

## 3. Ruang lingkup

**Termasuk:** agen percakapan WhatsApp, prospecting & riset, pipeline bisnis F0–F5,
orkestrasi job/event/approval, dashboard monitoring, kantor 3D, notifikasi owner,
continuous improvement, dan agen **Developer** (maintain situs + bangun otomasi).

**Tidak termasuk (saat ini):** pembayaran otomatis (payment gateway), e-signature,
email marketing, publishing konten otomatis, multi-tenant/auth dashboard.

---

## 4. Kebutuhan fungsional (FR)

### FR-1 · Sales Agent (Nadia) — percakapan inti
- **FR-1.1** Menerima pesan WhatsApp masuk, membalas dalam bahasa lead (Indonesia-first).
- **FR-1.2** Pipeline LangGraph: deteksi bot → RAG → lead scoring → strategi →
  penjadwalan (Cal.com) → generasi balasan → kirim → booking → evaluasi → refleksi →
  long-term memory.
- **FR-1.3** Lead scoring 0–100 → segmen **Nurture (<40) / Objection (40–74) / Closing (≥75)**.
- **FR-1.4** Sapaan maksimal **sekali per hari** per lead (zona `Asia/Jakarta`).
- **FR-1.5** Kualifikasi → menawarkan **video demo** atau **meeting**; memicu Scoper.
- **FR-1.6** Outbound follow-up otomatis hanya pada jam kerja (default 08:00–17:00, Sen–Jum).

### FR-2 · Media masuk
- **FR-2.1** Voice note → transkrip lokal (faster-whisper, default model `small`, bahasa `id`).
- **FR-2.2** Gambar → deskripsi via DeepSeek vision.

### FR-3 · Supervisor & briefing
- **FR-3.1** Supervisor menerima pesan bebas owner & menjawab (penasihat), memakai
  profil owner (`workspace/owner/profile.md`).
- **FR-3.2** **Daily Briefing** (08:00): aktivitas tiap agent + kendala + saran → owner.
- **FR-3.3** Supervisor mereview operasional & menandai anomali (bukan mendelegasikan kerja).

### FR-4 · Prospecting & Scout (D1)
- **FR-4.1** Cari prospek bisnis via Google Maps (scraping) + **targeting** niche
  "siap-AI/low-tech" (bisnis teknologi dikecualikan).
- **FR-4.2** Lengkapi kontak (telepon/website) dengan Tavily (search + extract).
- **FR-4.3** Kuota harian: hari-1 stok awal (100), hari berikutnya lead berkualitas (5);
  target harian berbasis lokasi (default Batam, 20 lead/hari).
- **FR-4.4** Scout mengaudit lead → pain-point, offering, sudut pendekatan; gate
  `readiness = scouted_ready` sebelum masuk Sales.
- **FR-4.5 (anti-duplikat)** Prospek yang **nomornya** (`wa_jid`) atau **bisnisnya**
  (nama + alamat/domain situs) sudah ada di database **dilewati** — tidak disimpan
  ulang, tidak diantre ulang. Jumlah yang dilewati dilaporkan sebagai `duplicates`.

### FR-5 · Scoper & PRD (D2)
- **FR-5.1** Dari transkrip/demo/catatan meeting, hasilkan **PRD** ala `prd-skill`
  (20 bagian) + checklist teknis, tersimpan di `projects` + file.
- **FR-5.2** Evaluasi & revisi PRD otomatis (ambang skor, maks revisi).
- **FR-5.3** Loop pertanyaan terbuka → Sales menanyakan ke klien → PRD diperbarui.

### FR-6 · Legal & Finance (D2)
- **FR-6.1** Dari PRD, hasilkan draf **SPK + NDA + invoice DP** (dokumen file).
- **FR-6.2** Catat invoice & verifikasi pembayaran DP (`invoice.dp_paid`) → memicu Intake.
- **FR-6.3** Pelunasan (`invoice.final_paid`) → proyek `delivered`, memicu Content + Developer.

### FR-7 · Intake & Credential (D2)
- **FR-7.1** Buat **link intake aman** (token + expiry) untuk mengumpulkan akses.
- **FR-7.2** Simpan kredensial di **vault terenkripsi AES-256-GCM**; nilai rahasia
  tidak ditulis ke workspace proyek.

### FR-8 · QA & Scribe (D3)
- **FR-8.1** QA menguji kelayakan rilis (webhook, struktur JSON, guardrail) → laporan skor.
- **FR-8.2** Bila lulus → Scribe menyusun **SOP + panduan pengguna**.

### FR-9 · Handover (D4)
- **FR-9.1** Serah terima → **BAST** + invoice pelunasan (butuh persetujuan owner).

### FR-10 · L1 Support (D4)
- **FR-10.1** Triage keluhan klien (diteruskan Sales), jawab dari SOP, buat tiket,
  eskalasi bila darurat. Menjawab **ke Sales**, bukan langsung ke klien.

### FR-11 · Monitor (D4)
- **FR-11.1** Pantau infra/biaya **dan** kinerja agent (job gagal, rasio sukses,
  antrean, usulan menunggu); kirim alert + usulan ke owner/Supervisor.

### FR-12 · Developer & Automation (D4) — **baru, pengganti Retainer**
- **FR-12.1 (Maintain)** Audit situs/repo terpasang: SEO/detectability (title, meta,
  sitemap, robots, HTTPS), performa, keamanan → rencana perbaikan.
- **FR-12.2 (Build)** Dari permintaan owner, rencanakan & bangun **otomasi / AI agent** baru.
- **FR-12.3** **Engine = OpenCode** (`opencode run`, headless) untuk mengubah kode di repo.
- **FR-12.4** **Tools = GitHub** (`gh` + git: clone, branch, commit, push, PR) dan
  platform developer: Vercel, Cloudflare (API token + **R2/S3**: Access Key ID,
  Secret Access Key, endpoint), Supabase, Google Search Console, Analytics.
- **FR-12.5** **Approval wajib** sebelum push/PR (`developer.apply`) dan deploy
  (`developer.deploy`). Menyetujui approval otomatis menjalankan job eksekusinya.
- **FR-12.6** Audit berkala otomatis (harian) untuk semua target aktif (`developer.sweep`).
- **FR-12.7** Semua hasil (rencana, hasil eksekusi) disimpan sebagai file workspace.

### FR-13 · Content & Flywheel (D5)
- **FR-13.1** Susun studi kasus 1 halaman (identitas klien disamarkan).
- **FR-13.2** Masukkan ke **knowledge base** → dipakai ulang Sales (RAG) & Scout (bukti sosial).

### FR-14 · Continuous improvement
- **FR-14.1** Setiap job selesai/gagal dicatat sebagai `lesson` di `agent_improvements`.
- **FR-14.2** Loop `agent.optimize` (harian 07:00) menghasilkan `suggestion` (status
  `proposed`) → notifikasi owner.
- **FR-14.3** Suggestion disetujui → otomatis masuk Knowledge (kategori `playbook`) → dipakai via RAG.
- **FR-14.4** Papan Pertumbuhan (`/pertumbuhan`) menampilkan tren, rasio sukses, usulan.

### FR-15 · Orkestrasi (pipeline F0)
- **FR-15.1** **Job queue + scheduler**: job tipe apa pun dengan `runAt`, retry, dedupe.
- **FR-15.2** **Event log/outbox** sebagai pemicu & observability.
- **FR-15.3** **Approval** human-in-the-loop (prefix balasan via WhatsApp + endpoint).
- **FR-15.4** **Notifikasi owner** via WhatsApp/Telegram.
- **FR-15.5** Perintah owner via WhatsApp (HELP, STATUS, PENDING, APPROVE/REJECT,
  PRD, LEGAL, DP PAID, BUILT, QUALIFY, LINK, CHANNELS, TICK, **MAINTAIN**, **DEV**).

### FR-16 · Dashboard & Kantor 3D
- **FR-16.1** Dashboard Next.js: Control Room, alur & kanban bisnis, leads, proyek,
  invoice, tiket, knowledge, pipeline/aktivitas, kualitas, pertumbuhan, supervisor,
  booking, pengaturan, workflow per agent.
- **FR-16.2** Kantor 3D (the-delegation) menampilkan status agent live dari `/agents/status`.

### FR-17 · Notifikasi owner
- **FR-17.1** Kirim ke WhatsApp (bila `OWNER_WA_JID`) dan/atau Telegram (bila token +
  chat id). Bot kanal klien L1 opsional (default mati).

---

## 5. Kebutuhan non-fungsional (NFR)

| Kode | Kebutuhan |
| --- | --- |
| **NFR-1 Keandalan** | Balasan gagal dicoba ulang (tunggu koneksi + retry); job punya retry + recovery setelah restart. |
| **NFR-2 Anti-dobel** | Dedup pesan by `messageId` + antre per-kontak; job idempoten via `dedupeKey`. |
| **NFR-3 Keamanan** | Kredensial terenkripsi (AES-256-GCM); `.env` tidak di-commit; `API_KEY` opsional untuk endpoint webhook; `DRY_RUN` untuk uji tanpa kirim WhatsApp asli. |
| **NFR-4 Observability** | Event log, lesson per job, briefing harian, monitor, log PM2. |
| **NFR-5 Portabilitas** | TypeScript ESM (NodeNext); jalan di Windows (dev) via PM2. |
| **NFR-6 Skalabilitas provider** | Rantai fallback LLM (deepseek/antigravity/openrouter) + override per-node. |
| **NFR-7 Bahasa** | Antarmuka & balasan Indonesia-first; dokumen konsep di `docs/`. |
| **NFR-8 Biaya** | Default model gratis (OpenRouter) dengan fallback; DeepSeek sebagai cadangan. |
| **NFR-9 Kontrol** | Aksi berisiko selalu lewat approval owner. |

---

## 6. Batasan & asumsi

- WhatsApp via **Baileys** (unofficial); diperlukan nomor WhatsApp & sesi (`baileys_auth`).
- Postgres 16 + pgvector (Docker) wajib hidup; skema dijalankan otomatis saat boot (`sql/init.sql`).
- Owner berbicara sebagai satu identitas (single owner); belum multi-tenant.
- Cal.com MCP saat ini gagal auth (401) → penjadwalan slot belum aktif.
- `DEVELOPER_OPENCODE_MODEL` harus diisi dengan model OpenCode yang punya kredit
  (default OpenCode di mesin ini mengarah ke OpenRouter tanpa kredit → gagal 402).

## 7. Di luar ruang lingkup (saat ini)

Payment gateway otomatis, e-signature, email transaksional, Google Maps API resmi
(masih scraping), publishing konten ke media sosial, auth dashboard, evaluasi kualitas
untuk semua agent (baru Sales/QA).

---

## 8. Kriteria penerimaan (contoh) & definisi selesai

- **FR-1:** Pesan masuk diuji lewat `POST /simulate` menghasilkan balasan + skor + strategi.
- **FR-4:** `POST /prospecting/daily` menyimpan lead baru berstatus `discovered` untuk Scout.
- **FR-6:** `POST /projects/:id/dp-paid` menandai DP lunas → `intake.collect` berjalan.
- **FR-9:** Handover menghasilkan BAST + approval `handover.send`.
- **FR-12:** `POST /developer/:projectId` menghasilkan rencana + approval `developer.apply`;
  menyetujui approval men-enqueue `developer.apply` yang menulis kode via OpenCode,
  membuat branch + PR, lalu meminta approval `developer.deploy`.
- **Definisi selesai (DoD):** `npm run typecheck` lulus; perubahan dijalankan lewat PM2
  (`npx pm2 restart nadia-api-dev`); dokumentasi (`docs/`, `memory.md`) diperbarui.

## 9. Keterlacakan (ringkas)

| Kebutuhan | Modul utama |
| --- | --- |
| FR-1..2 | `src/graph/`, `src/whatsapp/`, `src/outreach/`, `src/integrations/{whisper,vision}.ts` |
| FR-3 | `src/supervisor/`, `src/pipeline/handlers/briefing.ts` |
| FR-4 | `src/prospecting/`, `src/scout/`, `src/integrations/{maps,tavily,firecrawl,camoufox}.ts` |
| FR-5 | `src/scoper/` |
| FR-6 | `src/legal/` |
| FR-7 | `src/intake/`, `src/util/crypto.ts` |
| FR-8 | `src/qa/`, `src/scribe/` |
| FR-9..11 | `src/handover/`, `src/support/`, `src/monitor/` |
| FR-12 | `src/developer/`, `src/integrations/{opencode,github,devplatforms}.ts` |
| FR-13 | `src/content/`, `src/memory/knowledge.ts` |
| FR-14 | `src/improvement/`, `src/pipeline/jobs.ts` |
| FR-15 | `src/pipeline/` |
| FR-16 | `dashboard/`, `the-delegation/` |
| FR-17 | `src/notifications/`, `src/integrations/telegram.ts` |
