# DEVELOPER.md — Divisi Developer (Adit)

> **Status:** DRAFT — silakan isi bagian bertanda _(isi)_ sesuai keinginan Anda.
> Dokumen ini dibagi menjadi **dua bagian**: **Internal** (sistem kita sendiri) dan
> **External** (pekerjaan untuk klien). Bagian teknis yang sudah terpasang ada di §3.

---

## 0. Ringkasan bersama

| Aspek | Nilai |
| --- | --- |
| Agent | `developer` — persona **Adit** · divisi **D4 · Client Success & Developer** |
| Engine | **OpenCode** (headless `opencode run`) — model default `deepseek/deepseek-flash` |
| Tools | **GitHub** (`gh` + git) · Cloudflare (**R2/S3**) · Vercel · Supabase · Search Console · Analytics |
| Approval | `developer.apply` (push/PR) & `developer.deploy` (deploy) |
| Tabel | `dev_targets` (target situs/repo/otomasi) |

**Prinsip bersama:**
- Perubahan **dapat diaudit** (branch + PR), rapi, dan kecil.
- **Guardrail** dijaga (lihat §1.8 & §2.8).
- Semua hasil (rencana & eksekusi) disimpan sebagai file + event.

---

# 1. INTERNAL (kebutuhan sistem kita)

> Fokus: memelihara & mengembangkan sistem internal (repo kita) secara otomatis.

### 1.1 Tujuan & ruang lingkup
Agent Developer Internal Berfokus Pada Perbaikan Dan Implementasi jika supervisor membutuhkan perubahan atau update untuk agent misalnya supervisor dan monitor melihat hasil dari Riset masih kurang optimal banyak duplikat dan mempengaruhi cara kerja sales agent permintaan ini akan di teruskan ke Pertumbuhan agent termasuk bug atau temuan apapun yang menggangu operasional 

### 1.2 Target (repo/sistem)
Target Nya adalah Repo internal ini Namun Dengan Batasan Tidak Boleh Merubah Developer Itu Sendiri Kecuali Owner yang Merubahnya, tidak boleh merubah Supervisor dan Monitor 

### 1.3 Akses & kredensial
Developer Internal Berhak Mengakses .env secara keselurahn tetapi tidak boleh mengganti atau merubah tanpa ada persetujuan

### 1.4 Pemicu
Pemicu nya ini berasal dari Kanal Pertumbuhan Agent Setiap ada pemberitahuna dari supervisor dan monitor dan saya menyetujuinya maka perubahan dan perbaikan itu akan dilakukan sendiri oleh agent developer internal 

### 1.5 Jenis tugas / mode
1.Perbaikan Fitur
2.Penambhan Fitur
3.Bug Fix
4.Perbaikan Agent
5.Dokumentasi (Setiap Perubahan Harus Terdokumentasi Terpisah Di Wokspace Agent Developer Internal)
6.Membuat Backup Sistem Untuk Rollback jika implementasi Fitur Baru atau Perbaikan Menimbulkan masalah 

### 1.6 Alur kerja
Untuk Alur Kerja sendiri Agent Developer Internal Harus Mengacu pada Kanal Pertumbuhan agent Ketika saya menyetujui perbaikan atau perubahan otomatis agent developer internal langsung mengerjakannya, Membaca Brife Kasar, Melakukan Uji Test, Menerapkannya jika berhasil dan menulis dokumentasinya 

### 1.7 Otonomi & approval
**Pilihan Anda saat ini: Full otomatis.** _(konfirmasi/ubah)_
- [x] Full otomatis (commit → merge → deploy tanpa approval)
- [ ] PR saja, owner yang merge
- [ ] Approval sebelum push/PR & sebelum deploy
- Catatan risiko: Perubahan Tidak Perlaku Jika yang dirubah adalah agent developer itu sendiri dan Supervisor Serta Monitor, Untuk Sales Perlu Approval dari saya selebihnya boleh Full Otomatis 

### 1.8 Guardrail / larangan
LARANGANnya Jelas Tidak Boleh Mengutak Atik .ENV Tanpa Persetujuan tetapi menggunakannya di perbolehkan, Tidak Boleh mengubah supervisor dan monitor (hanya saya yang boleh merubah atau meneyntuha ranah itu) tidak boleh looping tak terbatas alur kerja sudah saya tuliskan di atas, tidak boleh menghapus database asli jika ada yang ingin dihapus perlu konfirasi dari saya dan kenapa dihapus harus jelas, Jika brief kurang jelas lemparkan pertanyaan ke supervisor biar supervisor yang memperjelas alasannya kenapa dan jika masih binung baru supervisor menyampaikan kepada saya, tidak boleh melakukan perubahan tata letak folder sembarangan kecuali ada izin dari saya, tidak boleh melakukan perubahan sales mendadak tanpa ada approval dari saya, tidak boleh mengakses wa tanpa atau folder wa tanpa ada persetujuan dari saya.

### 1.9 Output & penyimpanan
Simpan Hasilnya di Folder Wokspace Develoepr Internal dengan Requiretment.md,design.md dan task.md sehingga saya tau apa yang dikerjakan

### 1.10 Jadwal (scheduler)
Hanya Bekerja Ketika Permintaan di setujui dari kanal pertumubuhan agent

### 1.11 Definisi selesai / QA
Selesai disini Ketika hasil dari test dan implementasi tidak ada masalah dan sesuai dengan brief dari supervisor

# 2. EXTERNAL (pekerjaan untuk klien)

> Fokus: mengelola aset digital klien (situs/repo yang sudah dibangun) & membangun otomasi/AI agent klien.

### 2.1 Tujuan & ruang lingkup
_(isi)_

### 2.2 Target (situs/repo klien)
_(isi)_ — cara menautkan repo klien (`project.meta.repoUrl`, `liveUrl`, `platform`) & `dev_targets`.

### 2.3 Akses & kredensial
_(isi)_ — mis. akses repo klien, token platform per-klien, kebijakan NDA.

### 2.4 Pemicu
_(isi)_ — usulan saat ini: otomatis setelah `invoice.final_paid` (job `developer.maintain`). _(ubah?)_

### 2.5 Jenis tugas / mode
_(isi)_ — mis. audit SEO/performa/keamanan, perbaikan, fitur lanjutan, deploy.

### 2.6 Alur kerja
_(isi/konfirmasi)_ — sama seperti §1.6 tetapi pada repo/situs klien.

### 2.7 Otonomi & approval
_(isi)_ — mengingat ini menyentuh aset klien, apa aturannya? (usulan: approval sebelum push & deploy)

### 2.8 Guardrail / larangan
_(isi)_ — mis. jangan ubah di luar scope, jangan deploy tanpa izin klien, data klien aman.

### 2.9 Output & penyimpanan
_(isi)_ — mis. rencana per-klien, PR, laporan maintain.

### 2.10 Jadwal (scheduler)
_(isi)_ — mis. audit berkala tiap klien.

### 2.11 Definisi selesai / QA
_(isi)_

---

## 3. Yang sudah terpasang (status teknis saat ini)

**Modul & integrasi**
- `src/developer/{run,plan,repository,types}.ts` — audit target, rencana, eksekusi, deploy, sweep.
- `src/integrations/opencode.ts` — engine headless (parser JSONL, resolve `.exe` Windows).
- `src/integrations/github.ts` — `gh` + git (clone/branch/commit/push/PR, `gh auth setup-git`).
- `src/integrations/devplatforms.ts` — Vercel/Cloudflare/Supabase/Search Console/Analytics.
- `src/integrations/cloudflareR2.ts` — Cloudflare R2 (S3) via SigV4.

**Job & event**
- Job: `developer.maintain`, `developer.build`, `developer.sweep`, `developer.apply`, `developer.deploy`.
- Event: `developer.target_registered`, `developer.plan_ready`, `developer.applied`, `developer.pr_opened`, `developer.deployed`, `developer.sweep`.
- Approval: `developer.apply`, `developer.deploy` (disetujui → otomatis men-enqueue job eksekusi).

**Endpoint**
- `GET /developer/platforms` · `GET /developer/targets` · `POST /developer/targets`
- `POST /developer/:projectId` (maintain) · `POST /developer/build` · `POST /developer/apply`
- Cloudflare: `GET /developer/cloudflare/zones` · `GET /developer/cloudflare/r2/objects` · `GET|POST|DELETE /developer/cloudflare/r2/object` · `GET /developer/cloudflare/r2/buckets`
- Vercel: `GET /developer/vercel/projects` · `POST /developer/vercel/deploy`

**Perintah owner:** `DEV <deskripsi>` · `MAINTAIN <projectId>`

**Config `.env`:** `DEVELOPER_ENABLED`, `DEVELOPER_WORKSPACE_DIR`, `DEVELOPER_OPENCODE_BIN/MODEL/AGENT/TIMEOUT_MS`, `DEVELOPER_SWEEP_ENABLED/HOUR`, `DEVELOPER_MAX_PLAN_ITEMS`, `DEVELOPER_TELEGRAM_BOT_TOKEN`, `DEVELOPER_TELEGRAM_CHAT_ID`, `GITHUB_TOKEN`, `VERCEL_TOKEN`/`VERCEL_DEPLOY_HOOK_URL`, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_R2_*`, `SUPABASE_ACCESS_TOKEN`, `SEARCH_CONSOLE_*`, `PLAUSIBLE_*`.

**Bot Telegram Developer (approval):** bot terpisah untuk persetujuan eksekusi.
- Env: `DEVELOPER_TELEGRAM_BOT_TOKEN` + `DEVELOPER_TELEGRAM_CHAT_ID`.
- Saat approval `developer.*` dibuat, permintaan dikirim ke bot ini dengan tombol inline
  **✅ Setujui / ❌ Tolak** (atau balas teks `APPROVE <id>` / `REJECT <id>`).
- Menyetujui langsung men-enqueue job eksekusi (`developer.apply`/`developer.deploy`).
- Bot dinyalakan saat boot (`startDeveloperTelegramBot`) dan menonaktifkan diri bila token kosong.

**Pemicu yang sudah otomatis:** `invoice.final_paid` → `developer.maintain`; `developer.sweep` harian 11:00.

**Mode Internal (diterapkan)**
- **Target internal** otomatis (`ensureInternalTarget`): repo `DEVELOPER_INTERNAL_REPO` + folder `DEVELOPER_INTERNAL_LOCAL` (kind `internal`).
- `developer.build` scope `internal` (default) → rencana → **langsung jadwalkan `developer.apply`** (full-auto; persetujuan manusia sudah di kanal Pertumbuhan).
- `developer.apply` internal (`runInternalApply`) dengan guardrail:
  - **Backup** branch (`backup/developer-<ts>`) sebagai titik rollback.
  - OpenCode mengubah kode → **cek scope** (`src/developer/guardrails.ts`): `src/developer/`, `src/supervisor/`, `src/monitor/`, `.env`, `baileys_auth/`, `logs/`, `node_modules/`, `dist/` → **dibatalkan**; file Sales (`src/graph/`, `src/outreach/`) → **butuh approval owner**.
  - **Wajib `tsc --noEmit`** lulus (lewat `node tsc`) — gagal ⇒ rollback.
  - Commit → branch → push → **merge ke branch dasar** (full-auto) → opsional restart PM2 (`DEVELOPER_INTERNAL_AUTORESTART`).
  - Menulis **dokumentasi** `requirement.md`, `design.md`, `task.md` di workspace target.
- **Pemicu kanal Pertumbuhan**: menyetujui `suggestion` dengan `evidence.kind="proposal"`
  (`POST /improvements/:id/approve`) → otomatis menjadwalkan `developer.build` internal (dedup per improvement).
- Env tambahan (khusus internal): `DEVELOPER_INTERNAL_REPO`, `DEVELOPER_INTERNAL_LOCAL`, `DEVELOPER_INTERNAL_AUTORESTART`.
- Modul baru: `src/developer/{guardrails,shell,telegram}.ts`.

---

## 4. Ide & catatan

Ide **sub-agent Developer** (di bawah koordinasi agent Developer/Adit, tunduk pada guardrail §1.8):

1. **dev-backend** — Perbaikan/penambahan API, job queue, dan integrasi server (`src/pipeline/`, `src/integrations/`): handler, endpoint, skema data, serta optimasi performa. Wajib kecil, teruji (`tsc --noEmit`), dan dapat di-rollback.
2. **dev-dashboard** — Perbaikan UI/dashboard internal (`dashboard/`): tampilan monitoring job & event, panel approval, serta bug tampilan. Menjaga konsistensi desain dan responsif.
3. **dev-ops** — Operasional & keandalan: backup/rollback, health-check, konfigurasi PM2/deploy, dan otomasi pemeliharaan (sweep, kebersihan log). Tidak menyentuh file terlarang (`.env`, `src/supervisor/`, `src/monitor/`).

Catatan: sub-agent hanya menerima brief dari agent Developer; ranah sensitif tetap butuh persetujuan owner, dan setiap perubahan didokumentasikan (`requirement.md`, `design.md`, `task.md`).
