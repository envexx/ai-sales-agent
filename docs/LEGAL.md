# Legal & Finance (F2)

Agen Deal Desk. Mengubah **PRD proyek** menjadi **draf kontrak (SPK) + NDA +
invoice DP**, mencatat invoice, lalu memverifikasi pembayaran DP sebelum
pekerjaan dimulai.

```
PRD proyek (+ data klien)
      │
      ▼
Legal & Finance (LLM)
      │
      ├─ SPK.md              draf kontrak kerja
      ├─ NDA.md              perjanjian kerahasiaan
      └─ INVOICE-DP.md/html  invoice uang muka
      │
      ▼
invoices (Postgres, status sent→paid)  → event legal.ready
      │
      ▼
DP lunas (API / perintah owner)  → event invoice.dp_paid
      │
      ▼
siap untuk Intake & Credential
```

## Struktur file

```
src/legal/
  types.ts     # LegalDraft, LegalResult, LegalClause
  prompts.ts   # prompt penyusun draf SPK/NDA/termin
  run.ts       # runLegal(), markProjectInvoicePaid()
src/pipeline/entities.ts   # getProject/getClient + invoice helpers
```

## Pemicu

| Cara | Keterangan |
| --- | --- |
| **API** | `POST /legal` dengan `{ projectId, amount }` |
| **Perintah owner** | `LEGAL <projectId> [dp]` |
| **Job** | `legal.draft` (`{ projectId, amount }`) |
| **Verifikasi DP** | `POST /projects/:id/dp-paid` atau perintah `DP PAID <projectId>` → event `invoice.dp_paid` |

## Cara memakai

```bash
curl -X POST http://localhost:4000/legal ^
  -H "content-type: application/json" ^
  -H "x-api-key: $API_KEY" ^
  -d "{\"projectId\":\"<project-uuid>\",\"amount\":12500000}"
```

Perintah owner (WhatsApp):
```
LEGAL <projectId> 12500000
DP PAID <projectId>
```

## Output

Metadata: tabel `invoices` (kind `dp`, amount, status, due_at, paid_at) dan
`projects.meta.legal`. Dokumen: `workspace/projects/<projectId>/legal/`:

- `SPK.md` — kontrak: para pihak, ruang lingkup, deliverable, timeline, termin
  (DP + pelunasan), klausul, tanda tangan. Yang belum pasti ditandai `[PERLU DIISI]`.
- `NDA.md` — klausul kerahasiaan.
- `INVOICE-DP.md` + `INVOICE-DP.html` — invoice siap cetak/PDF.

## Prinsip & batasan

- **Bukan nasihat hukum.** Setiap dokumen diberi disclaimer; wajib ditinjau
  manusia sebelum ditandatangani.
- **Nominal DP** tidak dibuat otomatis dari PRD (PRD sengaja tanpa harga);
  diberikan lewat `amount` atau `projects.meta.quote`.
- **Tidak mengarang**: info yang belum ada ditulis `[PERLU DIISI: …]`.
- E-sign, payment gateway, dan pengiriman dokumen ke klien belum diotomasi
  (pencatatan pembayaran dilakukan via API/perintah owner).

## Konfigurasi

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `LEGAL_ENABLED` | `true` | Aktifkan Legal & Finance |
| `LEGAL_DUE_DAYS` | `7` | Jatuh tempo invoice DP (hari) |

## Langkah berikutnya (F2)

- **Intake & Credential Collector** — dipicu `invoice.dp_paid`: kirim formulir
  aman → simpan kredensial di vault terenkripsi (`credentials` + `APP_SECRET`).
