# Business UI

Dashboard: `http://localhost:3001`. Beranda adalah kanban; `/workflow` adalah satu diagram React Flow untuk seluruh proses bisnis. `/operasional` dan `/agents/:slug` mengarah ke diagram yang sama. Data & Operasi tetap menggunakan halaman dan API masing-masing.

`GET /business/board` menyatukan lead → client → project dengan job, event dan approval yang terkait. Dashboard membaca ulang setiap 5 detik. Detail kartu menggunakan data terkini, termasuk ketika kartu berpindah kolom. Tidak ada drag/drop yang mengubah stage tanpa gate bisnis.

- Kolom berasal dari readiness lead / stage project; pekerjaan yang sedang berjalan dapat menunjukkan agent aktif.
- Node sebuah proses hanya menampilkan hasil yang memiliki job / event terkait. Node tanpa bukti berstatus “Belum ada bukti”.
- Selesainya satu balasan Sales tidak menandai seluruh proses Sales selesai. Handoff Scoper / project menjadi bukti kelanjutan.
- QA tidak lulus terlihat terhambat; Intake menunggu kredensial sebelum hasilnya dinyatakan selesai.
- API mengirim ringkasan event, bukan payload credential atau token intake.
- Board menampilkan 200 lead/project terbaru; jejak kartu berisi paling banyak 30 event terbaru dari jendela audit. Halaman data menyediakan akses lebih lengkap.

## Claw3D

Gunakan gateway bisnis, bukan gateway demo:

```powershell
cd claw3d
npm run business-gateway
# terminal lain
npm run dev
```

Gateway bisnis membaca API `http://127.0.0.1:4000` (ubah melalui `BUSINESS_API_URL`) dan mendengarkan `ws://127.0.0.1:18789` (`BUSINESS_ADAPTER_PORT`). Konfigurasi PM2 sudah memakai `server/business-gateway-adapter.js`.

Adapter memakai protokol kompatibilitas `demo`, dengan nama runtime “LangGraph Business”. Identitas, roster, riwayat dan event lifecycle berasal dari registry / pekerjaan bisnis. Tidak ada jawaban chat simulasi, agent contoh, atau operasi mutasi yang berpura-pura berhasil. Jalankan pekerjaan dan approval dari dashboard. Gateway hanya tersedia di loopback lokal.

Office dimuat di client karena memakai WebGL. Server custom memakai router upgrade handler Next 16 agar HMR dan hydration berjalan saat development.
