# Webhook & Format Lead

Dokumen ini menjelaskan cara memasukkan lead dari sumber luar (Instagram,
referral, scrape, spreadsheet, CRM, dll.) ke database agen, beserta **format
data** yang diterima dan yang tersimpan.

- **Endpoint:** `POST /webhook/leads`
- **Schema (machine-readable):** `GET /webhook/leads/schema`
- **Auth:** header `x-api-key: <API_KEY>` — hanya jika `API_KEY` diisi di `.env`.
  Kalau `API_KEY` kosong, endpoint terbuka (khusus development).
- **Content-Type:** `application/json`
- **Maksimal:** 500 lead per request

---

## 1. Bentuk body yang diterima

Endpoint menerima **tiga bentuk** — pilih yang paling cocok dengan sumber Anda:

### a. Objek tunggal

```json
{ "name": "Budi", "phone": "081298765432", "company": "CV Sinar Abadi" }
```

### b. Array of objek

```json
[
  { "name": "Budi", "phone": "081298765432" },
  { "name": "Rina", "phone": "085611122233" }
]
```

### c. Objek dengan `leads` (paling umum untuk sinkronisasi massal)

```json
{
  "leads": [
    { "name": "Budi", "phone": "081298765432" },
    { "name": "Rina", "phone": "085611122233" }
  ]
}
```

---

## 2. Field lead

Hanya **`phone`** yang wajib. Semua field punya **alias** (nama alternatif),
jadi Anda tidak perlu mengubah format sumber.

| Field | Tipe | Wajib | Alias yang diterima | Keterangan |
|---|---|---|---|---|
| `phone` | string | ✅ | `phone`, `whatsapp`, `wa`, `number`, `phone_number`, `phoneNumber`, `nomor`, `no_hp`, `noHp`, `msisdn`, `tel`, `telepon` | Nomor WhatsApp. Format bebas: `0812…`, `+62 812…`, `62812…`, atau JID penuh. Dinormalisasi otomatis. |
| `name` | string \| null | – | `name`, `nama`, `full_name`, `fullName`, `contact_name`, `contactName`, `kontak` | Nama kontak; dipakai agen untuk menyapa. |
| `company` | string \| null | – | `company`, `perusahaan`, `organization`, `organisasi`, `business`, `bisnis`, `company_name` | Dipakai untuk personalisasi pesan outreach. |
| `source` | string \| null | – | `source`, `sumber`, `channel`, `asal`, `utm_source` | Asal lead, mis. `instagram`, `referral`. |
| `notes` | string \| null | – | `notes`, `note`, `catatan`, `keterangan`, `description`, `desc`, `pesan`, `message`, `context`, `kebutuhan` | Konteks tambahan; jadi bahan pesan pembuka. |
| `tags` | string[] | – | `tags`, `label`, `labels`, `tag` | Bisa array atau string dipisah koma. Disimpan di `leads.meta.tags`. |
| `countryCode` | string \| null | – | `countryCode`, `country_code`, `kode_negara`, `cc` | Kode negara untuk normalisasi nomor. Default `WA_DEFAULT_COUNTRY_CODE` (62). |
| `queue` | boolean | – | `queue`, `antre`, `antri`, `outreach` | `true` (default) = langsung masuk antrean outreach; `false` = simpan saja. |

> **Deduplikasi:** lead di-*upsert* berdasarkan `wa_jid` (nomor setelah
> normalisasi). Mengirim nomor yang sama dua kali akan **memperbarui** lead
> yang ada, bukan membuat duplikat. Field yang kosong tidak menimpa nilai lama.

---

## 3. Contoh

### cURL — satu lead (pakai alias Indonesia)

```bash
curl -X POST http://localhost:4000/webhook/leads \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{ "nama": "Budi Santoso", "nomor": "081298765432",
        "perusahaan": "CV Sinar Abadi", "sumber": "instagram",
        "kebutuhan": "Order masih manual via Excel" }'
```

### cURL — banyak lead sekaligus

```bash
curl -X POST http://localhost:4000/webhook/leads \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "leads": [
      { "name": "Budi Santoso", "phone": "081298765432", "company": "CV Sinar Abadi",
        "source": "instagram", "notes": "Order manual", "tags": ["prioritas"] },
      { "name": "Rina Kusuma", "phone": "+62 856-111-222-33", "company": "PT Kopi Kita",
        "source": "referral", "queue": false }
    ]
  }'
```

### JavaScript

```ts
await fetch("http://localhost:4000/webhook/leads", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": process.env.API_KEY! },
  body: JSON.stringify({
    leads: [{ name: "Budi", phone: "081298765432", company: "CV Sinar Abadi" }],
  }),
});
```

### Python

```python
import requests

requests.post(
    "http://localhost:4000/webhook/leads",
    headers={"x-api-key": API_KEY},
    json={"leads": [
        {"name": "Budi", "phone": "081298765432", "company": "CV Sinar Abadi"},
    ]},
    timeout=15,
)
```

### Validasi tanpa menyimpan (dry-run)

Tambahkan `?dryRun=true` untuk memeriksa format tanpa menulis ke database —
berguna saat membangun integrasi:

```bash
curl -X POST "http://localhost:4000/webhook/leads?dryRun=true" \
  -H "content-type: application/json" \
  -d '{ "leader": "salah nama field" }'
```

---

## 4. Format respons

### Sukses

```json
{
  "dryRun": false,
  "received": 2,
  "created": 2,
  "invalid": 0,
  "leads": [
    {
      "id": "50fcf6f4-37c0-43a7-9665-ed022b87ceb6",
      "waJid": "6281298765432@s.whatsapp.net",
      "name": "Budi Santoso",
      "company": "CV Sinar Abadi",
      "outreachStatus": "pending"
    }
  ],
  "errors": []
}
```

### Sebagian gagal (422) — error per-field

Item yang valid tetap diproses; item yang gagal dilaporkan lengkap dengan
indeks dan nama field:

```json
{
  "dryRun": false,
  "received": 2,
  "created": 1,
  "invalid": 1,
  "leads": [ { "id": "…", "waJid": "6281298765432@s.whatsapp.net", "outreachStatus": "pending" } ],
  "errors": [
    {
      "index": 1,
      "phone": null,
      "errors": [{ "field": "phone", "message": "nomor wajib diisi, minimal 5 karakter" }]
    }
  ]
}
```

### Status code

| Code | Arti |
| --- | --- |
| `200` | Semua/sedikitnya satu lead berhasil |
| `400` | Body tidak dikenali, atau tidak ada lead |
| `413` | Lebih dari 500 lead dalam satu request |
| `422` | Semua item gagal validasi |
| `500` | Kesalahan server |

---

## 5. Format lead yang tersimpan (dibaca backend)

`GET /leads` dan `GET /prospects` mengembalikan objek berikut:

```json
{
  "id": "50fcf6f4-37c0-43a7-9665-ed022b87ceb6",
  "waJid": "6281298765432@s.whatsapp.net",
  "name": "Budi Santoso",
  "stage": "new",
  "score": 0,
  "segment": null,
  "firstSeen": "2026-10-05T03:20:00.000Z",
  "lastSeen": "2026-10-05T03:20:00.000Z",
  "meta": { "tags": ["prioritas"] },
  "kind": "prospect",
  "company": "CV Sinar Abadi",
  "source": "instagram",
  "notes": "Order manual",
  "outreachStatus": "pending",
  "outreachAttempts": 0,
  "lastOutreachAt": null,
  "nextFollowUpAt": "2026-10-05T03:20:00.000Z",
  "optOut": false
}
```

### Kolom tabel `leads`

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| `id` | text (uuid) | Primary key |
| `wa_jid` | text (unik) | Identitas WhatsApp — kunci dedup |
| `name`, `company`, `source`, `notes` | text | Data lead |
| `meta` | jsonb | `{ tags: [...] }` + metadata lain |
| `kind` | text | `inbound` (chat duluan) atau `prospect` (dari webhook) |
| `stage` | text | `new` → `contacted` → … |
| `score`, `segment` | int / text | Diisi setelah agen menilai percakapan |
| `outreach_status` | text | Lihat siklus di bawah |
| `outreach_attempts` | int | Jumlah pesan keluar yang sudah dicoba |
| `last_outreach_at`, `next_follow_up_at` | timestamptz | Penjadwalan |
| `opt_out` | boolean | `true` = jangan pernah dihubungi lagi |
| `first_seen`, `last_seen` | timestamptz | Jejak waktu |

### Siklus `outreach_status`

```
pending ──► messaged ──► replied      (lead membalas)
   │            │
   │            └──► follow_up ──► done   (habis percobaan)
   │
   └──► none        (queue=false: tidak dihubungi)

replied / done / opted_out  (berhenti)
opted_out                (lead balas STOP)
```

| Nilai | Arti |
| --- | --- |
| `pending` | Menunggu pesan pembuka |
| `messaged` | Pembuka terkirim, menunggu balasan |
| `follow_up` | Dijadwalkan follow-up |
| `done` | Selesai (habis percobaan, tanpa balasan) |
| `replied` | Lead membalas — outreach berhenti |
| `opted_out` | Lead balas **STOP** — tidak pernah dihubungi lagi |
| `none` | Disimpan tapi tidak masuk antrean (`queue: false`) |

---

## 6. Catatan penting

- **Normalisasi nomor:** `0812…` → `62812…`, `+62 812-…` → `62812…`.
  Gunakan `countryCode` untuk nomor non-Indonesia.
- **Opt-out otomatis:** jika lead membalas **STOP** (atau "berhenti",
  "jangan hubungi"), status menjadi `opted_out` dan agen berhenti menghubungi.
- **Outreach hanya jam kerja** (`WORK_START_HOUR`–`WORK_END_HOUR`,
  `WORK_DAYS`, `WORK_TIMEZONE`). Lihat `README.md`.
- **Mode uji:** dengan `DRY_RUN=true`, pesan outreach disusun tetapi tidak
  dikirim (status log `dry_run`).
