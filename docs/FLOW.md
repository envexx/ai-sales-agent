# FLOW — Alur Bisnis Multi-Agent

> Dokumen acuan alur setelah koreksi dari pemilik produk. Versi ini
> **menggantikan** asumsi lama (supervisor sebagai router). Baca ini sebelum
> mengubah peran agent atau menambah pipeline.

## 1. Prinsip

1. **Supervisor = peninjau, bukan router.** Chat masuk **langsung ke Sales**.
   Supervisor memantau, mengoreksi penyimpangan, dan **merangkum laporan harian
   tiap agent** untuk owner.
2. **Sales adalah pusat pipeline** — paling banyak tahap: menerima chat,
   menyeleksi (demo vs meeting), menggerakkan Scoper/Legal, memforward jawaban
   L1 ke klien.
3. **Push vs Pull**
   - **Push (terjadwal):** Prospecting, Scout, Monitor, Briefing.
   - **Pull (dipicu Sales):** Scoper/PRD, Legal.
   - **Gate (dipicu status):** Sales (butuh `scouted_ready`), QA & Docs (butuh `done_review`).
4. **Owner hanya muncul di 3 titik:** status `preview` (review PRD + kredensial
   lalu bangun), **persetujuan** (approval), dan **emergency**.
5. **Sales satu-satunya kanal ke klien.** L1 Support menjawab **ke Sales**,
   bukan langsung ke klien.

## 2. Dua mode kerja

| Mode | Pemicu | Contoh | Catatan |
| --- | --- | --- | --- |
| Turn-based | pesan masuk | Sales (semua chat), perintah owner | Sales menangani sendiri, tanpa delegasi |
| Event / jadwal | job queue + event | Prospecting, Scout, Scoper, Legal, Intake, QA, Docs, Handover, Retainer, Content, Briefing, Monitor | dijalankan scheduler tiap `PIPELINE_TICK_SECONDS` |

## 3. Peran & sifat agent

| Agent | Divisi | Sifat | Pemicu | Output | Lapor supervisor |
| --- | --- | --- | --- | --- | --- |
| Supervisor | D0 | push (harian) | laporan agent + `briefing` | ringkasan ke owner, koreksi | — |
| Research & Scout | D1 | push (harian) | job `prospecting.scan` → `scout.audit` | lead `discovered` → `scouted_ready` + pain-point | ya |
| Sales | D1 | turn-based | chat masuk | kualifikasi, jalur demo/meeting, forward L1 | ya |
| Scoper & PRD | D2 | **pull** dari Sales | job `scoper.prd` | PRD + checklist | ya |
| Legal & Finance | D2 | **pull** dari Sales | job `legal.draft` | SPK/NDA + invoice DP | ya |
| Intake & Credential | D2 | pull (tahap PRD) | job `intake.collect` | link aman → vault → status `preview` | ya |
| QA & Documentation | D3 | gate | `qa.run` → (lulus) `scribe.docs` | laporan QA lalu SOP + panduan | ya |
| Handover & Final Invoice | D4 | push | setelah `done` | BAST + invoice pelunasan | ya |
| L1 Support & Triage | D4 | pendukung Sales | keluhan dari Sales | jawaban **ke Sales** + tiket | ya |
| Infra & Cost Monitor | D4 | push (harian) | job `monitor.check` | alert biaya/infra | ya |
| Developer & Automation | D4 | push | job `developer.maintain` / `developer.build` / `developer.sweep` | audit situs + rencana → OpenCode → PR GitHub | ya |
| Case Study & Content | D5 | push (terakhir) | job `content.case_study` | studi kasus → knowledge (flywheel) | ya |

## 4. Alur end-to-end

```
  Prospecting (harian)         Scout (harian)                 SALES (lead scouted_ready)
  ┌───────────────────┐        ┌───────────────────┐          ┌────────────────────────────┐
  │ H1: 100 lead stok │        │ maks 15/hari      │          │ chat masuk → Sales langsung│
  │ H2+: 5 lead/hari  │──────▶ │ gate kualitas     │────────▶ │ pilih: VIDEO DEMO / MEETING│
  └───────────────────┘        │ → scouted_ready   │          └──────────────┬─────────────┘
                               └───────────────────┘                         │
                        (demo)  ◀────────────── jalur ──────────────▶  (meeting)
                           │                                             │
                           │                                    upload transkrip/notes
                           ▼                                             ▼
                    ┌──────────────────────────────────────────────────────────┐
                    │ Scoper & PRD   (sumber: chat saja / chat + transkrip)     │
                    └───────────────────────────┬──────────────────────────────┘
                                                │  (Sales minta) ──▶ Legal: SPK/NDA + invoice DP
                                                ▼
                    ┌──────────────────────────────────────────────────────────┐
                    │ Intake & Credential → LINK AMAN (token + expiry)          │
                    │ kredensial → vault → status proyek = PREVIEW              │
                    └───────────────────────────┬──────────────────────────────┘
                                                ▼
                    ╔══════════════════════════════════════════════════════════╗
                    ║  ANDA: review PRD + kredensial → bangun sistem klien      ║
                    ╚═══════════════════════════════┬══════════════════════════╝
                                                │ pekerja selesai
                                                ▼
                    ┌──────────────────────────────────────────────────────────┐
                    │ Status = DONE REVIEW → QA + Documentation/SOP memeriksa   │
                    │ oke → Status = DONE                                       │
                    └───────────────────────────┬──────────────────────────────┘
                                                ▼
                    ┌──────────────────────────────────────────────────────────┐
                    │ Kirim app sesuai petunjuk                                 │
                    │ L1 Support menjawab → SALES → Sales meneruskan ke klien   │
                    └───────────────────────────┬──────────────────────────────┘
                                                ▼
                    ┌──────────────────────────────────────────────────────────┐
                    │ Case Study & Content (terakhir) → knowledge base (flywheel)│
                    └──────────────────────────────────────────────────────────┘
```

## 5. Cabang Sales: Video Demo vs Meeting

| Jalur | Arti | Sumber data untuk Scoper/PRD |
| --- | --- | --- |
| **Video Demo** | Sales mengirim/menawarkan demo video | **transkrip chat** (+ interaksi demo) |
| **Meeting** | Klien minta bertemu langsung | **transkrip/notes meeting** yang di-upload **+ transkrip chat** |

Aturan: Sales **wajib** menandai jalur sebelum Scoper dipanggil (`demo` atau
`meeting`). Untuk jalur meeting, Scoper menunggu **transkrip/notes di-upload**
dulu; tanpa itu, Scoper tidak berjalan.

## 6. State machine

### Lead
```
discovered ──(Scout gate)──▶ scouted_ready ──(Sales mulai)──▶ in_sales ──▶ won | lost | nurture
```
- `discovered` → dari Prospecting (stok).
- `scouted_ready` → hanya Scout yang menaikkan (data lengkap/akurat).
- Sales **tidak** memproses lead yang belum `scouted_ready`.

### Proyek
```
scoping ──(PRD dibuat)──▶ preview ──(owner selesai)──▶ done_review ──(QA+Docs oke)──▶ done ──▶ delivered
```
- `scoping`: Scoper bekerja (PRD).
- `preview`: menunggu owner membangun (PRD + kredensial siap).
- `done_review`: menunggu QA + Docs.
- `done`: QA + Docs menyatakan layak; app siap dikirim.
- `delivered`: setelah pelunasan/serah terima.

### Intake link
```
pending ──(klien submit)──▶ submitted
        └─(lewat expiry)──▶ expired
```

## 7. Aturan gate (tegas)

1. **Gate Sales:** hanya `scouted_ready`. (Jika belum, Sales menunggu — tidak ada kerja.)
2. **Gate QA/Docs:** hanya saat `done_review`; mereka berhak mengubah status → `done`.
3. **Pull-only:** Scoper & Legal tidak berjalan tanpa permintaan Sales.
4. **Intake:** hanya setelah tahap PRD; hasilnya mengubah status proyek → `preview`.
5. **Kanl klien:** hanya Sales. L1 menjawab ke Sales.

## 8. Throughput

| Agent | Kuota | Catatan |
| --- | --- | --- |
| Prospecting | H1: **100 lead** (stok awal); H2+: **5 lead/hari** | menambah stok |
| Scout | **15 lead/hari** dari stok | menyaring & menandai `scouted_ready` |
| Sales | mengikuti `scouted_ready` | lead berkualitas saja |

Konsekuensi: stok 100 hari-1 tersaring oleh Scout ±7 hari; setelah itu inflow
Prospecting 5/hari < kapasitas Scout 15/hari (Scout mengejar kualitas).

## 9. Laporan harian & Supervisor

- Setiap agent menghasilkan **ringkasan harian** (apa yang dikerjakan, hasil, anomali).
- **Supervisor** mengagregasi laporan → mengirim **Daily Briefing** ke owner,
  dan **menandai koreksi** bila ada penyimpangan (mis. Sales melapor closing X
  vs tidak Y, job gagal, gate dilanggar).
- Supervisor **tidak** mendelegasikan chat.

## 10. Link kredensial (aman)

- **Halaman web ber-token** (bukan file): `token` acak + `expiry` + status.
- Klien membuka link → mengisi kredensial → tersimpan **terenkripsi** di vault.
- Setelah submit: status proyek → **`preview`**; job `expire` menutup link yang kedaluwarsa.
- Owner melihat di `preview`: **PRD apa yang harus dikerjakan** + **kredensial tersedia**.

## 11. Manajemen workspace

```
workspace/projects/<projectId>/
  PRD.md / PRD.json          # Scoper
  meetings/<id>.md           # transkrip/notes meeting (jalur meeting)
  legal/SPK.md NDA.md INVOICE-DP.*
  intake/                    # daftar permintaan akses (nilai rahasia TIDAK di sini)
  docs/SOP.md PANDUAN.md     # Scribe
  qa/QA-REPORT.md
  handover/BAST.md
  content/CASE-STUDY.md
```
Nilai kredensial **hanya** di vault (`credentials`), file hanya menyimpan
referensi/hint. Ini mencegah workspace berantakan dan bocor.

## 12. Peta pemicu (final)

| Pemicu | Job / Event | Agent |
| --- | --- | --- |
| Harian | `prospecting.scan` | Prospecting |
| Setelah `prospect.discovered` | `scout.audit` | Scout |
| Chat masuk | (langsung) | Sales |
| Sales tandai jalur + minta PRD | `scoper.prd` | Scoper |
| Sales minta | `legal.draft` | Legal |
| Tahap PRD | `intake.collect` | Intake |
| Owner `BUILT` | `project.built` → `qa.run` | QA |
| `qa.completed` lulus | `scribe.docs` | Docs |
| `docs.ready` / `done` | `handover.finalize` | Handover |
| Pelunasan | `invoice.final_paid` | Retainer, Content |
| Harian | `briefing` + `monitor.check` | Supervisor, Monitor |
| Keluhan (dari Sales) | `support.triage` | L1 Support |

## 13. Perubahan dari sistem saat ini

| Area | Saat ini | Menjadi |
| --- | --- | --- |
| Supervisor | router chat (LangGraph) | monitor + koreksi + rangkum laporan |
| Sales | terima semua chat | hanya `scouted_ready`; pilih demo/meeting; forward L1 |
| Prospecting | sekali jalan/manual | harian (H1 100, H2+ 5) + stok |
| Scout | per-prospek | harian maks 15 + gate `scouted_ready` |
| Scoper | otomatis saat booking | pull; sumber chat atau transkrip/notes |
| Legal | otomatis | pull saja |
| Intake | file + vault | halaman web token + expiry → status `preview` |
| QA/Docs | manual/berantai | gate `done_review` → berhak set `done` |
| L1 | chat ke klien | jawab ke Sales; Sales meneruskan |
| Status proyek | `scoping`→`handover`→`delivered` | `scoping`→`preview`→`done_review`→`done`→`delivered` |

## 14. Urutan implementasi

| Fase | Isi |
| --- | --- |
| **F0.1** | State machine + gate + status proyek + manajemen workspace |
| **F0.2** | Supervisor: monitor + koreksi + laporan harian |
| **F0.3** | Prospecting & Scout: jadwal harian + kuota + gate `scouted_ready` |
| **F0.4** | Sales: gate lead siap + jalur demo/meeting + lapor |
| **F0.5** | Scoper (pull, transkrip meeting) + Legal (pull) |
| **F0.6** | Intake: link web token+expiry → status `preview` |
| **F0.7** | QA/Docs gate `done_review`→`done`; L1 ke Sales; Content |
| **F0.8** | Dashboard menyesuaikan state/gate (Control Room, per-agent) |

## 15. Keputusan terkunci

- Jalur **meeting** → Scoper memakai **transkrip/notes meeting** (+ chat).
- Link kredensial → **halaman web ber-token + expiry**.
- Throughput → **100 stok awal**, **Scout 15/hari**, **Prospecting 5/hari**.
