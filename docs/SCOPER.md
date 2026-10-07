# Scoper & PRD Builder (F2)

Agen Deal Desk (pra-pengerjaan). Mengubah **transkrip percakapan Sales** menjadi
**PRD** (Product Requirement Document) terstruktur + checklist teknis yang siap
dieksekusi — sehingga Anda tinggal membuka editor saat semuanya sudah jelas.

```
Transkrip Sales (+ pain-point Scout, catatan lead)
      │
      ▼
Scoper (LLM terstruktur)
      │
      ▼
PRD: ringkasan · tujuan · ruang lingkup · kebutuhan fungsional
     · alur logika · integrasi (webhook/API) · struktur DB
     · asumsi · pertanyaan terbuka · checklist teknis
      │
      ▼
clients + projects (Postgres)  →  event `prd.ready`
      │
      ▼
workspace/projects/<projectId>/PRD.md + PRD.json
```

## Struktur file

```
src/scoper/
  types.ts     # Prd, PrdRequirement, PrdFlow, PrdIntegration, PrdTable
  prompts.ts   # prompt builder PRD
  run.ts       # runScoper(): transkrip → PRD → DB + file
src/pipeline/entities.ts   # upsertClient, createProject, updateProject, listProjects
```

## Pemicu

| Cara | Keterangan |
| --- | --- |
| **Otomatis** | Saat Sales melaporkan `booking.status = "confirmed"` → job `scoper.prd` dijadwalkan (dedupe per lead) |
| **API** | `POST /scoper` dengan `{ leadId }` atau `{ threadId }` |
| **Perintah owner (WhatsApp)** | `PRD <leadId>` |
| **Job** | `scoper.prd` dengan payload `{ leadId }` / `{ threadId }` |

## Cara memakai

```bash
curl -X POST http://localhost:4000/scoper ^
  -H "content-type: application/json" ^
  -H "x-api-key: $API_KEY" ^
  -d "{\"leadId\":\"<lead-uuid>\",\"title\":\"Otomasi Order & Follow-up\"}"
```

Perintah owner (WhatsApp):
```
PRD <leadId>
```

Daftar proyek: `GET /projects`.

## Output

Metadata di Postgres (`clients`, `projects`), dokumen di
`PROJECTS_WORKSPACE_DIR/<projectId>/`:

- `PRD.md` — dokumen siap baca (checklist sebagai `- [ ]`).
- `PRD.json` — PRD terstruktur (untuk mesin/agen berikutnya).

Isi PRD: ringkasan, tujuan, in/out scope, kebutuhan fungsional (must/should/could),
alur logika, integrasi (nama/tipe/arah/tujuan), struktur data (tabel + field),
asumsi, pertanyaan terbuka, dan checklist teknis.

## Prinsip

- **Tidak mengarang**: kebutuhan yang tidak ada di transkrip masuk ke
  `openQuestions`, bukan diasumsikan.
- **Tidak ada harga final** di PRD.
- `stage` proyek dimulai dari `scoping` (siap untuk fase berikutnya: Legal &
  Finance → Intake & Credential).

## Batasan

- Kualitas PRD bergantung pada kelengkapan transkrip. Percakapan tahap awal →
  banyak `openQuestions` (ini fitur, bukan bug).
- Saat ini memakai transkrip + catatan lead + pain-point Scout; akses dokumen
  eksternal (mis. proposal PDF) belum diambil.

## Konfigurasi

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `SCOPER_ENABLED` | `true` | Aktifkan Scoper |
| `PROJECTS_WORKSPACE_DIR` | `./workspace/projects` | Folder dokumen proyek |

## Langkah berikutnya (F2)

- **Legal & Finance** — SPK/NDA + invoice DP dari PRD & data klien.
- **Intake & Credential Collector** — formulir aman → vault kredensial terenkripsi.
