# Arsitektur & Alur Kerja Multi-Agent

> Dokumen tunggal yang menjelaskan **semua peran agent**, **alur kerja**, dan
> **cara mereka saling terhubung**. Acuan alur yang lebih ringkas ada di
> [`FLOW.md`](FLOW.md); daftar agent ada di [`AGENTS.md`](AGENTS.md).

---

## 1. Apa sistem ini

Bisnis **AI Automation** yang berjalan otonom: dari mencari prospek, menjual,
menyusun PRD, menagih, sampai dukungan & retensi — dikerjakan oleh **12 agent**
(1 Supervisor + 11 worker) di atas **LangGraph** dan sebuah **mesin orkestrasi
job/event**. Owner (manusia) hanya muncul di tiga titik: **preview** (membangun
sistem klien), **persetujuan**, dan **emergency**.

### Prinsip

1. **Supervisor = peninjau**, bukan router. Chat masuk **langsung ke Sales**.
2. **Sales = pusat pipeline** — paling banyak tahap.
3. Agent bekerja dalam 4 sifat:
   - **Turn-based** (dipicu pesan) — Sales, L1 (via Sales), perintah owner.
   - **Push** (terjadwal) — Prospecting, Scout, Monitor, Briefing, Retainer, Content.
   - **Pull** (dipicu Sales) — Scoper/PRD, Legal.
   - **Gate** (dipicu status) — Sales (butuh `scouted_ready`), QA+Documentation (butuh `done_review`).
4. **Satu kanal ke klien: Sales.** L1 menjawab ke Sales; Sales meneruskan.
5. **Semua terekam** di `jobs` (antrean), `events` (log), `approvals` (keputusan).

---

## 2. Peta divisi

```
D0 Command Center        Supervisor
D1 Growth & Acquisition  Prospecting · Scout · Sales
D2 Deal Desk             Scoper & PRD · Legal & Finance · Intake & Credential
D3 Delivery & Quality    QA & Guardrail · Documentation & SOP
D4 Client Success        Handover & Final Invoice · L1 Support · Monitor · Retainer
D5 Brand & Flywheel      Case Study & Content
```

---

## 3. Peran setiap agent

### D0 · Command Center

| Agent | Sifat | Pemicu | Input → Output | Gate / Catatan |
| --- | --- | --- | --- | --- |
| **Supervisor** | push (harian) | job `supervisor.review` + `briefing` | event/job seluruh agent → **laporan harian + anomali** ke owner | **Tidak** mendelegasikan chat |

### D1 · Growth & Acquisition

| Agent | Sifat | Pemicu | Input → Output | Gate |
| --- | --- | --- | --- | --- |
| **Research & Scout** | push (harian) | `prospecting.daily` (H1: 100 → H2+: 5/hari) → `scout.daily`/`scout.audit` (maks 15) | niche+kota → prospek `discovered` + audit pain-point/sudut outreach → lead `scouted_ready` | **Menahan Sales** sampai lead siap |
| **Sales (Nadia)** | turn-based | chat masuk | percakapan WhatsApp → kualifikasi, jalur demo/meeting, booking; mem-forward L1 | **Hanya** lead `scouted_ready`; satu-satunya kanal ke klien |

### D2 · Deal Desk

| Agent | Sifat | Pemicu | Input → Output | Gate |
| --- | --- | --- | --- | --- |
| **Scoper & PRD** | **pull** dari Sales | `scoper.prd` (atau `QUALIFY`) | transkrip chat (demo) / **transkrip meeting** → **PRD** di `projects` | Jalur `meeting` wajib punya transkrip |
| **Legal & Finance** | **pull** | `legal.draft` / `LEGAL` | PRD+klien → draft **SPK + NDA + invoice DP** | Tidak jalan tanpa permintaan |
| **Intake & Credential** | pull (tahap PRD) | `intake.collect` | PRD → **link aman (token+expiry)** → vault | Hasil submit → status proyek **`preview`** |

### D3 · Delivery & Quality

| Agent | Sifat | Pemicu | Input → Output | Gate |
| --- | --- | --- | --- | --- |
| **QA & Documentation** | gate | `qa.run` (via `BUILT`) → lulus `scribe.docs` | target uji → laporan QA → SOP + panduan; **menaikkan proyek ke `done`** | Hanya saat `done_review` |

### D4 · Client Success & Developer

| Agent | Sifat | Pemicu | Input → Output | Catatan |
| --- | --- | --- | --- | --- |
| **Handover & Final Invoice** | push | `handover.finalize` (setelah `done`) | BAST + invoice pelunasan | Butuh **persetujuan owner** |
| **L1 Support & Triage** | via Sales | keluhan klien (Sales relay) | klasifikasi + jawab dari SOP → tiket; eskalasi bila gagal sistem | **Menjawab ke Sales**, bukan ke klien |
| **Infra & Cost Monitor** | push (harian) | `monitor.check` | metrik → alert infra/biaya | — |
| **Developer & Automation** | push | `developer.maintain` (pelunasan) · `developer.build` · `developer.sweep` (harian) | audit situs (SEO/performa/keamanan) + rencana → **OpenCode** → PR GitHub | Engine **OpenCode**; tools GitHub/Vercel/Cloudflare/Supabase; push & deploy butuh **persetujuan owner** |

### D5 · Brand & Flywheel

| Agent | Sifat | Pemicu | Input → Output | Catatan |
| --- | --- | --- | --- | --- |
| **Case Study & Content** | push (terakhir) | `content.case_study` (setelah pelunasan) | hasil proyek → studi kasus (nama disamarkan) → **knowledge base** | Menutup **flywheel** |

---

## 4. Arsitektur teknis

### Dua mode

```
MODE TURN-BASED (pesan)                 MODE EVENT/JADWAL (otomatis)
WhatsApp / API                          scheduler tiap PIPELINE_TICK_SECONDS
   │                                        │
   ▼                                        ▼
prepare turn (lead + log + opt-out)     claimDueJobs()  (jobs ring)
   │                                        │
   ├─ perintah owner? → handler             └─ handler[type] → hasil
   ├─ kendala klien? → L1 → Sales relay          │
   └─ selain itu → SALES (langsung)              ├─ emitEvent(...)  (events)
                                                 └─ enqueueJob(next) (rantai)
```

### Layanan bersama

| Layanan | Modul | Fungsi |
| --- | --- | --- |
| Job queue + scheduler | `src/pipeline/` (`jobs.ts`, `scheduler.ts`, `schedule.ts`) | antrean, retry, jadwal harian |
| Registry agent | `src/pipeline/agentRegistry.ts` | peta job/event → agent (dipakai status & dashboard) |
| Lifecycle & gate | `src/pipeline/lifecycle.ts` | `LEAD_READINESS`, `PROJECT_STAGES`, gate |
| Event log | `src/pipeline/events.ts` | jejak aktivitas + pemicu workflow |
| Approval (HITL) | `src/pipeline/approvals.ts` | persetujuan owner |
| Notifikasi | `src/notifications/` | pesan ke owner |
| Vault kredensial | `src/util/crypto.ts` (AES-256-GCM) | simpan kredensial terenkripsi |
| LLM provider | `src/llm/` | DeepSeek / Antigravity (per-node override) |
| Workspace | `workspace/projects/<id>/` | dokumen + evidence proyek |

### Entitas data (Postgres)

| Entitas | Tabel | Menghubungkan |
| --- | --- | --- |
| Lead/prospek | `leads` (+`readiness`) | Prospecting → Scout → Sales |
| Percakapan | `conversations` | Sales, L1 |
| Klien | `clients` | konversi lead → proyek |
| Proyek | `projects` (+`stage`) | Scoper → Intake → QA → Docs → Handover |
| Invoice | `invoices` | Legal/Handover → pelunasan → Retainer/Content |
| Tiket | `tickets` | L1 |
| Kredensial | `credentials` (terenkripsi) | Intake |
| Kanal klien | `client_channels` | pemetaan chat → proyek |
| Transkrip meeting | `meeting_notes` | jalur meeting → Scoper |
| Link intake | `intake_links` | Intake → `preview` |
| Antrean & log | `jobs`, `events` | semua agent |
| Persetujuan | `approvals` | owner |
| Knowledge | `knowledge_docs` | RAG Sales/Scout + flywheel |

---

## 5. Alur end-to-end (saling terhubung)

```
            ┌────────────────────────── SUPER──────────────────────────┐
            │  pantau · koreksi · rangkum laporan harian → owner         │
            └───────▲───────────────────────────────────────────────────┘
                    │ laporan harian (semua agent)
┌──────────────┐   ┌──────────────┐   ┌───────────────────────────┐
│ PROSPECTING  │──▶│    SCOUT     │──▶│           SALES            │
│ harian 100/5 │   │ 15/hari gate │   │ chat · pilih jalur         │
└──────────────┘   └──────────────┘   └───────┬──────────┬────────┘
  prospect.discovered  scouted_ready         demo        meeting
                                             │            │ (upload transkrip)
                                             ▼            ▼
                                    ┌────────────────────────────┐
                                    │        SCOPER & PRD         │
                                    └──────────────┬─────────────┘
                              (Sales minta) ──────▶ │  LEGAL: SPK/NDA + invoice DP
                                                   ▼
                                    ┌────────────────────────────┐
                                    │  INTAKE: link aman (token)   │
                                    │  kredensial → vault          │
                                    │  status proyek = PREVIEW      │
                                    └──────────────┬─────────────┘
                                                   ▼
                    ╔══════════════════════════════════════════════╗
                    ║  ANDA: tinjau PRD + kredensial → BANGUN        ║
                    ╚═══════════════════┬══════════════════════════╝
                                        │ BUILT
                                        ▼
                    ┌────────────────────────────────────────────┐
                    │ status DONE_REVIEW → QA ──▶ DOCS/SOP         │
                    │ (lulus) → status DONE                         │
                    └───────────────┬────────────────────────────┘
                                    ▼
                    ┌────────────────────────────────────────────┐
                    │ kirim app · L1 menjawab → SALES → klien       │
                    └───────────────┬────────────────────────────┘
                                    ▼
                    ┌────────────────────────────────────────────┐
                    │ pelunasan → RETAINER  +  CONTENT (studi kasus)│
                    │ studi kasus → knowledge ──▶ SALES/Scout (RAG) │
                    └────────────────────────────────────────────┘
```

### Narasi rantai otomatis

1. **Prospecting** (`prospecting.daily`) → prospek `discovered` + `prospect.discovered`.
2. Event memicu **Scout** per lead; Scout → `scouted_ready` + `lead.scouted_ready`.
3. **Sales** hanya bekerja pada `scouted_ready`. Sales menentukan jalur:
   - **demo** → Scoper dari transkrip chat.
   - **meeting** → **transkrip di-upload** → Scoper dari transkrip + chat.
   Booking terkonfirmasi / `QUALIFY` → job `scoper.prd`.
4. **Scoper** menulis PRD (`prd.ready`). **Legal** (pull) → `legal.ready` + invoice DP.
5. **DP lunas** (`invoice.dp_paid`) → `intake.collect` → link aman → kredensial → status **`preview`**.
6. Owner `BUILT` → `project.built` → status **`done_review`** → `qa.run`.
7. QA lulus → `scribe.docs` → status **`done`** → `handover.finalize` (approval owner).
8. **Pelunasan** (`invoice.final_paid`) → `developer.maintain` + `content.case_study`.
9. **Content** → `case_study.ingested` → masuk `knowledge_docs` → dipakai **RAG Sales & Scout** (flywheel).
10. **Harian**: `briefing` (Supervisor) + `monitor.check` (Monitor) + `supervisor.review` (koreksi).

---

## 6. State machine & gate

### Lead
```
discovered ──(Scout)──▶ scouted_ready ──(Sales)──▶ in_sales ──▶ won | lost | nurture
```
Gate: **Sales/outreach hanya `scouted_ready`**. Lead inbound otomatis `scouted_ready`.

### Proyek
```
scoping ──(PRD)──▶ preview ──(owner BUILT)──▶ done_review ──(QA+Docs)──▶ done ──(pelunasan)──▶ delivered
```
Gate: **QA & Docs hanya saat `done_review`**; merekalah yang menaikkan ke `done`.

### Intake link
```
pending ──(klien submit)──▶ submitted        pending ──(expiry)──▶ expired
```

---

## 7. Peta pemicu (job → agent)

| Job | Agent | Dipicu oleh |
| --- | --- | --- |
| `prospecting.daily` / `prospecting.scan` | Prospecting | jadwal / API / chat lama |
| `scout.daily` → `scout.audit` | Scout | jadwal harian / event |
| `scoper.prd` | Scoper | booking confirmed / `QUALIFY` |
| `legal.draft` | Legal | permintaan Sales / owner |
| `intake.collect` | Intake | `invoice.dp_paid` |
| `intake.expire` | Intake | jadwal harian |
| `qa.run` | QA | `project.built` (`BUILT`) |
| `scribe.docs` | Docs | `qa.completed` lulus |
| `handover.finalize` | Handover | `docs.ready` (setelah `done`) |
| `support.triage` | L1 | keluhan klien (Sales relay) |
| `monitor.check` | Monitor | jadwal harian |
| `supervisor.review` | Supervisor | jadwal harian |
| `developer.maintain` / `content.case_study` | Developer / Content | `invoice.final_paid` |

### Event kunci → efek

| Event | Efek |
| --- | --- |
| `prospect.discovered` | menqueue `scout.audit` |
| `lead.scouted_ready` | lead masuk antrean outreach Sales |
| `prd.ready` | proyek siap untuk Legal |
| `invoice.dp_paid` | `intake.collect` (link kredensial) |
| `intake.submitted` | status proyek → `preview` |
| `project.built` | status `done_review` → `qa.run` |
| `qa.completed` (lulus) | `scribe.docs` |
| `docs.ready` | status `done` → `handover.finalize` |
| `invoice.final_paid` | `developer.maintain` + `content.case_study` |
| `case_study.ingested` | knowledge base diperbarui (flywheel) |

---

## 8. Titik interaksi owner

| Kapan | Cara |
| --- | --- |
| Briefing harian | otomatis (WhatsApp) |
| Status / tinjau | `STATUS`, `BRIEFING`, `PENDING`, `TICK`, `HELP` |
| Persetujuan | `APPROVE`/`REJECT <id>` atau dashboard `/approvals` |
| Memulai PRD | `QUALIFY <leadId> [demo|meeting]` |
| Legal | `LEGAL <projectId> [dp]` · `DP PAID <projectId>` |
| Titik "built" | `BUILT <projectId> [webhookUrl]` |
| Kanal klien | `LINK <chatId> <projectId>` · `CHANNELS` |
| Darurat | notifikasi otomatis (tiket `emergency`, `monitor.alert`) |

---

## 9. Laporan harian & Supervisor

- Setiap agent meninggalkan jejak di `jobs` + `events`.
- **Supervisor** (`supervisor.review`, `GET /supervisor/report`) merangkum
  aktivitas per agent dan menandai **anomali** (job gagal, prospek menumpuk
  menunggu Scout, proyek telat `done_review`, approval menunggu) ke owner.
- **Briefing** harian menyertakan snapshot bisnis; `monitor.check` menyertakan
  kesehatan infra/biaya.

---

## 10. Workspace & kredensial

```
workspace/projects/<projectId>/
  PRD.md / PRD.json        # Scoper
  meetings/<id>.md          # transkrip meeting (jalur meeting)
  legal/SPK.md NDA.md INVOICE-DP.*
  intake/                   # daftar permintaan akses (nilai rahasia TIDAK di file)
  docs/SOP.md PANDUAN.md
  qa/QA-REPORT.md
  handover/BAST.md
  content/CASE-STUDY.md
```
Nilai kredensial **hanya** di vault (`credentials`, terenkripsi). Link intake
ber-token + expiry di-serve backend (`/intake/:token`).

---

## 11. Referensi cepat

**Endpoint kunci** (API `:4000`): `/agents`, `/agents/status`, `/supervisor/report`,
`/pipeline/{jobs,tick,events}`, `/approvals`, `/leads/:id/{qualify,meeting}`,
`/projects`, `/invoices`, `/tickets`, `/knowledge`, `/intake/:token`,
`POST /prospecting`, `POST /scoper`, `POST /legal`, `POST /qa/:id`.

**Env penting**: `LLM_PROVIDER`, `PROSPECTING_{NICHE,LOCATION,DAY1_QUOTA,DAILY_QUOTA}`,
`SCOUT_DAILY_QUOTA`, `INTAKE_LINK_TTL_HOURS`, `PUBLIC_BASE_URL`, `APP_SECRET`,
`OWNER_WA_JID`, `PIPELINE_TICK_SECONDS`.

**Status implementasi**: fase **F0.1–F0.7 selesai** (state machine, supervisor
peninjau, kuota harian, gate Sales + jalur, Scoper/Legal pull + transkrip,
intake link aman, L1→Sales). Penyesuaian dashboard (F0.8) ditangani agen UI.
