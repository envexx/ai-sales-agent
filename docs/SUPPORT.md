# L1 Support & Triage (F4)

Agent dukungan lini pertama untuk klien: menerima keluhan di **kanal klien
(Telegram)**, menjawab berdasarkan **SOP/panduan proyek**, dan mengeskalasi ke
owner hanya untuk kegagalan sistem/kode.

```
pesan klien (Telegram)
      │
      ▼
pemetaan kanal: chat_id → project_id   (tabel client_channels)
      │
      ▼
runSupport(): klasifikasi + jawab dari docs/SOP.md & PANDUAN.md
      │
      ├─ human_error / question → balas solusi (dari SOP), tiket 'open'
      └─ system_failure / emergency → balas + tiket 'escalated' + notifikasi owner
```

## Struktur file

```
src/support/
  run.ts           # runSupport(): triage + jawab dari SOP + tiket
  sopContext.ts    # loadSopContext(): ambil bagian SOP/panduan relevan
  telegramBot.ts   # long-polling Telegram → runSupport → balas
src/integrations/telegram.ts   # getUpdates / sendMessage / getMe
src/pipeline/entities.ts       # client_channels: linkChannel/getChannel/listChannels
```

## Menyiapkan Telegram

1. Buat bot via **@BotFather** di Telegram → salin token.
2. Isi `.env`: `TELEGRAM_BOT_TOKEN=123:ABC...`
3. Restart API. Bot memakai **long polling** (tanpa URL publik).
4. Tambahkan bot ke grup/chat klien.

## Menghubungkan kanal ke proyek

Saat klien menulis, bot membalas dengan `chat id`-nya. Hubungkan:

- **Perintah owner (WhatsApp):** `LINK <chatId> <projectId>`
- **API:** `POST /channels` `{ "channel":"telegram", "externalId":"<chatId>", "projectId":"<uuid>", "label":"Grup Klien A" }`

Daftar kanal: `GET /channels` atau perintah owner `CHANNELS`.

## Sumber jawaban (SOP)

Jawaban **dikunci ke dokumen proyek** yang dihasilkan agent Scribe:
`workspace/projects/<projectId>/docs/SOP.md` dan `PANDUAN.md`.

- `loadSopContext()` memilih paragraf relevan dengan pesan (berbasis kata kunci).
- Bila SOP tidak memuat jawabannya, agen mengatakan akan **diteruskan ke tim**
  (tidak mengarang langkah).

## Eskalasi

| Kategori | Tindakan |
| --- | --- |
| `human_error` (salah input/format) | Balas langkah perbaikan dari SOP; tiket `open` |
| `question` (cara pakai) | Balas dari panduan; tiket `open` |
| `system_failure` (error kode/sistem mati) | Balas + tiket `escalated` + **notifikasi darurat** ke owner |
| `other` | Balas seperlunya; tiket `open` |

## Endpoint

| Method | Path | Fungsi |
| --- | --- | --- |
| `POST` | `/support` | Proses satu pesan klien (`{ message, projectId, clientId? }`) |
| `GET` | `/tickets` | Daftar tiket |
| `GET` \| `POST` | `/channels` | Daftar / hubungkan kanal |

## Konfigurasi

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `SUPPORT_ENABLED` | `true` | Aktifkan agent |
| `TELEGRAM_ENABLED` | `true` | Aktifkan bot Telegram |
| `TELEGRAM_BOT_TOKEN` | – | Token bot (kosong = bot nonaktif) |

> Catatan: balasan Telegram dikirim balik ke kanal; eskalasi ke owner tetap lewat
> WhatsApp (notifikasi). Kanal lain (Slack / grup WhatsApp) dapat menyusul.
