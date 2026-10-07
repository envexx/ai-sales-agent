# Research Prospecting (D1)

Agent akuisisi (hulu). Menggantikan peran "Research" di supervisor: fokus
**mencari prospek bisnis** lalu menyiapkan bahan outreach untuk Sales.

```
niche + kota
      │
      ▼
Google Maps (scrape via Firecrawl)   → nama, rating, jumlah ulasan
      │
      ▼
Enrichment kontak (pencarian web + scrape situs)  → telepon/WA, website, email, alamat
      │
      ▼
Simpan ke `leads` (kind='prospect', antrean outreach)  → event prospect.discovered
      │
      ▼
Scout (job `scout.audit`)  → pain-point + peluang + sudut outreach ke lead.meta.scout
      │
      ▼
Sales/outreach (sudah ada) menindaklanjuti
```

## Struktur file

```
src/integrations/maps.ts     # scrape Google Maps → MapsPlace[]
src/prospecting/
  types.ts                   # ProspectBrief, ProspectCard, ProspectRunResult
  run.ts                     # runProspecting(): maps → enrich → leads → event + scout job
src/scout/index.ts           # scoutAudit(): pain-point dari sinyal yang tersedia
```

## Cara memakai

**Endpoint (sinkron):**
```bash
curl -X POST http://localhost:4000/prospecting ^
  -H "content-type: application/json" ^
  -d "{\"niche\":\"klinik kecantikan\",\"location\":\"Bandung\",\"limit\":5}"
```

**Via chat/WhatsApp** (dijadwalkan sebagai job, hasil dikirim ke owner):
```
cari prospek klinik kecantikan di Bandung
```

## Cara kerja

1. **Discovery** — `mapsSearch()` men-scrape `google.com/maps/search/<niche+kota>` via
   Firecrawl, lalu mengurai kartu `role="article"` (`class="hfpxzc"`) → nama + rating
   + jumlah ulasan.
2. **Enrichment** — untuk tiap bisnis, dicari situsnya lewat discovery web
   (Tavily/SearXNG/Bing), lalu dis-*scrape* dan diekstrak kontaknya (telepon/WA,
   website, email, alamat) dengan LLM. **Tavily** dipakai sebagai fungsi tambahan:
   mencari situs resmi bila discovery utama gagal, dan mengambil isi halaman
   (`/extract`) bila scrape Firecrawl kosong. Nomor HP dinormalisasi ke format `628…`.
3. **Simpan (dengan dedup)** — prospek dengan nomor valid **dan belum ada di
   database** di-`upsert` ke `leads` (`kind='prospect'`, `source='google_maps'`) dan
   masuk antrean outreach. Nomor/bisnis yang sudah pernah didapat **dilewati**
   (lihat *Anti-duplikat* di bawah).
4. **Scout** — job `scout.audit` menyusun hipotesis masalah, peluang otomasi, dan
   sudut outreach (value-first) ke `leads.meta.scout`.

Evidence disimpan di `workspace/prospecting/<runId>/` (`places.json` + isi situs).

## Anti-duplikat (penting)

Riset **tidak menyimpan ulang** bisnis/nomor yang sudah ada, agar tiap hari fokus
mencari **bisnis baru** dan tidak terjebak mengulang data yang sama:

1. **Dedup nomor** — sebelum menyimpan, `wa_jid` dicek (`getLeadByJid`). Bila nomor
   sudah ada (baik sebagai prospek **maupun** inbound/klien di Sales) → **dilewati**:
   tidak di-`update`, tidak di-antre ulang, dan **tidak** memicu `scout.audit` baru.
2. **Dedup bisnis** — walau nomornya berbeda, bila **nama + alamat ATAU domain situs**
   sama (`findProspectByBusiness`) → dilewati. Dipakai konservatif (wajib ada alamat
   atau situs) agar cabang berbeda tidak ikut terbuang.
3. Hasil run memuat `duplicates` (jumlah yang dilewati karena duplikat). Angka ini
   muncul di **progres Kanban** ("duplikat N") dan **notifikasi owner**.

Karena duplikat dilewati (tidak dihitung `saved`), loop **target harian** otomatis
lanjut ke niche berikutnya sampai target tercapai / katalog habis — jadi tidak
berhenti di data lama. **Titik awal niche juga dirotasi harian** (berdasarkan
tanggal), sehingga tiap hari dimulai dari niche yang berbeda dan cakupan bisnis
baru makin luas. Untuk memperluas jangkauan lebih jauh, naikkan
`PROSPECTING_DEFAULT_LIMIT`, `PROSPECTING_NICHES_PER_ROUND`, dan/atau
`PROSPECTING_MAX_ROUNDS` (atau tambah niche di `targeting.ts`).

## Batasan (penting)

- **Tanpa API resmi** (sesuai keputusan: hanya scraping). Google Maps memuat kartu
  secara *lazy*, jadi satu scrape biasanya hanya mendapat sebagian kecil hasil
  (`limit` = batas atas, bukan jaminan).
- **Data Maps** yang diambil dari halaman pencarian terbatas pada **nama + rating +
  jumlah ulasan**. Telepon/website didapat dari enrichment situs (tidak selalu ada).
- **Teks ulasan individual belum diambil** (butuh membuka tiap tempat). Scout memakai
  rating/volume + isi situs sebagai proksi dan menandai `confidence`.
- Scraping tunduk pada ToS pihak ketiga — gunakan secara wajar.

## Konfigurasi

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `PROSPECTING_ENABLED` | `true` | Aktifkan agent |
| `PROSPECTING_DEFAULT_LIMIT` | `8` | Batas kandidat Maps per run |
| `PROSPECTING_ENRICH` | `true` | Cari kontak via pencarian + scrape situs |
| `PROSPECTING_WAIT_MS` | `6000` | Tunggu render JS Maps sebelum scrape |
| `PROSPECTING_TARGET_COUNT` | `3` | Jumlah niche diambil dari katalog (mode tepat sasaran) |
| `PROSPECTING_EXCLUDE_TECH` | `true` | Kecualikan bisnis yang bergerak di bidang teknologi |
| `TAVILY_API_KEY` | – | Aktifkan Tavily (cari situs + ekstrak kontak) |
| `TAVILY_ENABLED` | `true` | Toggle fungsi tambahan Tavily |
| `PROSPECTING_DAILY_TARGET` | `20` | **Target lead baru** tersimpan per hari (mode tepat sasaran) |
| `PROSPECTING_NICHES_PER_ROUND` | `3` | Jumlah niche per putaran (target harian) — naikkan untuk menjangkau lebih banyak bisnis baru |
| `PROSPECTING_MAX_ROUNDS` | `8` | Maks putaran mengelilingi katalog per hari |

> **Mencari lebih banyak bisnis baru:** karena duplikat otomatis dilewati, perluas
> jangkauan dengan menaikkan `PROSPECTING_DEFAULT_LIMIT` (kandidat per niche),
> `PROSPECTING_NICHES_PER_ROUND`, `PROSPECTING_MAX_ROUNDS`, dan/atau menambah niche
> di `src/prospecting/targeting.ts`.

## Endpoint & job

| Method | Path / Tipe | Fungsi |
| --- | --- | --- |
| `POST` | `/prospecting` | Jalankan prospecting 1 niche (sinkron) |
| `GET` | `/prospecting/niches` | Katalog niche target + daftar vertikal teknologi |
| `POST` | `/prospecting/targeted` | 1 putaran tepat sasaran: pilih niche dari katalog + kecualikan teknologi |
| `POST` | `/prospecting/daily` | Kejar **target lead harian** (loop niche sampai tercapai) |
| `GET` | `/prospects` | Daftar prospek (outreach) |
| job | `prospecting.scan` | Prospecting terjadwal (`{ niche, location, limit? }`) |
| job | `prospecting.daily` | Kuota harian; tanpa `PROSPECTING_NICHE` otomatis mode tepat sasaran |
| job | `scout.audit` | Scout per prospek (dipicu `prospect.discovered`) |

## Targeting (tepat sasaran)

Agar hasil tidak asal, prospecting diarahkan ke **bisnis yang butuh otomasi/AI
tetapi awam teknologi** — mis. klinik tumbuh kembang anak, klinik kecantikan,
klinik gigi — dan **mengecualikan bisnis teknologi** (software house, agensi
digital, konsultan IT, SaaS, dsb.).

- Katalog niche + daftar pengecualian ada di `src/prospecting/targeting.ts`
  dan bisa disunting; lihat juga `GET /prospecting/niches`.
- `POST /prospecting/targeted` `{ location, count?, only?, limit?, queue? }`
  mengambil `count` niche prioritas tertinggi, menjalankannya, lalu
  mengagregasi hasil (`totals.saved`, `totals.excluded`, `totals.skipped`).
- Filter pengecualian memeriksa **nama + kategori + domain website** kandidat.

## Target harian (fokus area)

Job `prospecting.daily` (dan `POST /prospecting/daily`) **mengejar target lead
tersimpan per hari** (`PROSPECTING_DAILY_TARGET`, default 20). Bila target belum
tercapai, ia mengelilingi katalog niche (urut prioritas) beberapa putaran
(`PROSPECTING_NICHES_PER_ROUND`, maks `PROSPECTING_MAX_ROUNDS`) untuk area yang
dikonfigurasi (`PROSPECTING_LOCATION`, mis. **Batam**).

Setiap prospek yang tersimpan otomatis di-`enqueue` ke Scout (`scout.audit`),
sehingga menjadi `scouted_ready` (lead berkualitas yang siap di-outreach).

## Kartu live & progres

Setiap riset yang berjalan (baik dari API maupun job) membuat **job `running`**
sementara, sehingga kartunya **langsung muncul** di kolom **Riset** pada Business
Kanban. Selama proses berjalan, kartu menampilkan **bar progres** (fase + `processed/total`)
dan ringkasannya (tersimpan/dilewati/dikecualikan/duplikat). Klik kartu untuk melihat detail.

Dashboard mem-*poll* tiap 5 detik, jadi progres tampil mendekati real-time tanpa
menunggu riset selesai. Saat selesai, kartu Riset hilang dan digantikan kartu
prospek di kolom **Prospek**.

> Catatan: `POST /research` (Universal Research Engine) masih tersedia sebagai API
> umum, tetapi **agent** di supervisor kini `prospecting`, bukan `research`.
