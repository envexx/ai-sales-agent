import type { KnowledgeInput } from "../memory/knowledge.js";

/**
 * Knowledge base PT Core Solution Digital.
 *
 * Source of truth: "Master Knowledge Base & System Prompt — Nadia" (v1.0).
 * Each entry is one focused, self-contained document so the RAG node can
 * retrieve exactly the paragraph a prospect's question needs.
 */
export const seedKnowledge: KnowledgeInput[] = [
  /* ───────────────────────── profile ───────────────────────── */
  {
    title: "Tentang PT Core Solution Digital",
    content:
      "PT Core Solution Digital adalah perusahaan pengembangan solusi digital yang berfokus pada custom web application, AI business automation, custom AI agent, AI sales & lead automation, serta integrasi sistem dan internal business tools. Berdiri sejak 2025 dengan track record 20+ proyek klien. Positioning: technology partner untuk bisnis yang membutuhkan solusi custom, automation, AI, dan integrasi end-to-end — bukan sekadar pembuatan prototype.",
    metadata: { category: "profile", positioning: "technology-partner" },
  },
  {
    title: "Fokus & Target Pelanggan",
    content:
      "Fokus PT Core Solution Digital adalah membantu bisnis yang masih memiliki proses manual, operasional tidak efisien, atau membutuhkan transformasi digital yang lebih terukur. Target pelanggan: bisnis dan perusahaan (B2B) yang ingin mengotomatisasi proses kerja, membangun sistem internal, atau mengadopsi AI untuk operasional dan sales. Contoh pengalaman: B2B Lead AI Automation, AI Recruitment System, AI Sales System, dan aplikasi terapi untuk klinik tumbuh kembang anak.",
    metadata: { category: "profile", audience: "b2b" },
  },
  {
    title: "Cara Nadia Bekerja",
    content:
      "Nadia adalah perwakilan sales PT Core Solution Digital yang menangani percakapan awal dengan prospek. Cara kerjanya: (1) pahami kebutuhan prospek sebelum menawarkan solusi; (2) gali masalah bisnis, proses yang berjalan, sistem yang digunakan, integrasi, target, budget, dan timeline secara bertahap; (3) jangan menanyakan semua pertanyaan sekaligus — tanyakan hanya yang relevan dengan konteks; (4) rekomendasikan layanan yang paling sesuai; (5) harga yang diberikan adalah starting price, bukan harga final; (6) jika budget lebih kecil, prioritaskan pengurangan scope daripada diskon; (7) arahkan prospek yang qualified ke konsultasi via booking. Tujuan Nadia bukan menjual dengan segala cara, melainkan qualification dan rekomendasi solusi yang relevan. Nadia memperkenalkan diri cukup sebagai \"Nadia dari PT Core Solution Digital\" — tanpa menyebut diri sebagai AI.",
    metadata: { category: "policy", topic: "approach" },
  },

  /* ───────────────────────── services ──────────────────────── */
  {
    title: "Layanan: Custom Web Application Development",
    content:
      "Pengembangan aplikasi web custom sesuai kebutuhan bisnis seperti internal dashboard, admin panel, CRM, booking system, dan sistem operasional lainnya. Deliverables: UI/UX, frontend, backend/API, database, authentication, admin dashboard, deployment, dokumentasi, dan maintenance awal 3 bulan. Estimasi: Simple 1–2 minggu; Medium 3–5 minggu; Complex/Custom System 6–12+ minggu berdasarkan scope. Starting price: mulai Rp7.500.000.",
    metadata: { category: "service", slug: "web-app", startingPrice: 7500000 },
  },
  {
    title: "Layanan: AI Business Automation",
    content:
      "Otomatisasi proses bisnis yang repetitif, memakan waktu, atau membutuhkan perpindahan data antar sistem. Contoh: input data, follow-up, approval, reporting, customer support, routing pekerjaan, notifikasi, dan integrasi antar aplikasi. Deliverables: workflow automation, AI integration, dashboard monitoring, database, logging & activity tracking, API/webhook integration bila diperlukan, dan dokumentasi sistem. Estimasi: 3–7 hari untuk automation standar; scope kompleks atau banyak integrasi ditentukan setelah analisis. Starting price: mulai Rp3.500.000.",
    metadata: { category: "service", slug: "ai-automation", startingPrice: 3500000 },
  },
  {
    title: "Layanan: Custom AI Agent Development",
    content:
      "Pengembangan AI Agent sesuai kebutuhan bisnis, misalnya customer support agent, sales agent, research agent, recruitment agent, internal knowledge agent, operations agent, atau custom agent untuk workflow tertentu. Deliverables: AI agent, knowledge base/RAG, memory, tools integration, API integration, workflow, dashboard, logging & monitoring, deployment, dan dokumentasi. Estimasi: 7–14 hari untuk scope standar; multi-agent atau integrasi kompleks dihitung setelah discovery. Starting price: mulai Rp6.500.000.",
    metadata: { category: "service", slug: "ai-agent", startingPrice: 6500000 },
  },
  {
    title: "Layanan: AI Sales & Lead Automation",
    content:
      "Otomatisasi proses penjualan dari lead masuk hingga siap ditindaklanjuti sales: lead intake, qualification, scoring, follow-up, routing ke sales, reminder, CRM update, dan appointment booking. Deliverables: AI sales agent, lead qualification workflow, dashboard, CRM integration, WhatsApp/email integration, logging, analytics, dan dokumentasi. Estimasi: 7–14 hari untuk scope standar; multi-channel atau CRM khusus menyesuaikan scope. Starting price: mulai Rp7.500.000.",
    metadata: { category: "service", slug: "ai-sales", startingPrice: 7500000 },
  },
  {
    title: "Layanan: AI System Integration & Internal Business Tools",
    content:
      "Integrasi sistem bisnis dan pengembangan internal tools untuk menyatukan proses kerja yang terpisah. Dapat menghubungkan CRM, email, Google Sheets, database internal, website, dan API pihak ketiga. Deliverables: dashboard operasional, approval system, reporting tool, internal portal, employee tool, document processing system, internal knowledge system, API integration, database, authentication/role access, logging, deployment, dan dokumentasi. Estimasi: 7–14 hari untuk scope standar; sistem legacy atau banyak API pihak ketiga memerlukan technical assessment. Starting price: mulai Rp5.500.000.",
    metadata: { category: "service", slug: "system-integration", startingPrice: 5500000 },
  },

  /* ───────────────────────── pricing ───────────────────────── */
  {
    title: "Daftar Starting Price",
    content:
      "Starting price layanan PT Core Solution Digital: Custom Web Application Development mulai Rp7.500.000; AI Business Automation mulai Rp3.500.000; Custom AI Agent Development mulai Rp6.500.000; AI Sales & Lead Automation mulai Rp7.500.000; AI System Integration & Internal Business Tools mulai Rp5.500.000. Entry package / proyek kecil: Rp2.000.000–Rp3.000.000 untuk scope terbatas.",
    metadata: { category: "pricing", type: "price-list" },
  },
  {
    title: "Aturan Harga & Negosiasi",
    content:
      "Harga final tidak boleh dijanjikan sebelum scope cukup jelas. Final price menyesuaikan kompleksitas, jumlah fitur, jumlah integrasi, user role, dan kebutuhan khusus. Jika budget terbatas, prioritaskan scope adjustment daripada diskon besar. Nadia tidak memberikan diskon langsung dan tidak membuat promo sendiri. Proyek kecil sekitar Rp2–3 juta tersedia untuk kebutuhan dengan scope terbatas.",
    metadata: { category: "pricing", type: "rules" },
  },
  {
    title: "Pajak & Biaya Pihak Ketiga",
    content:
      "Harga belum termasuk PPN apabila berlaku sesuai status perpajakan perusahaan. Harga juga belum termasuk biaya layanan pihak ketiga seperti hosting/cloud, domain, OpenAI/Claude/Gemini API, WhatsApp API, email provider, database berbayar, dan layanan eksternal lainnya. Biaya operasional pihak ketiga dihitung terpisah dan akan diinformasikan sebelum proyek dimulai. Harga development umumnya mencakup analisis, pembangunan, integrasi, testing, deployment, dan dokumentasi sesuai scope.",
    metadata: { category: "pricing", type: "exclusions" },
  },
  {
    title: "Skema Pembayaran",
    content:
      "Proyek standar: 50% DP saat proyek dimulai, 30% setelah milestone utama / staging siap, 20% sebelum final deployment atau handover. Proyek kecil Rp2–3 juta: 50% DP, 50% setelah pekerjaan selesai.",
    metadata: { category: "payment" },
  },
  {
    title: "Promo & Diskon",
    content:
      "Saat ini tidak ada promo, bundling, atau diskon aktif. Nadia tidak boleh membuat atau menjanjikan promo yang tidak sedang ditetapkan oleh perusahaan. Jika prospek menanyakan diskon, arahkan ke penyesuaian scope sebagai gantinya.",
    metadata: { category: "promo" },
  },

  /* ───────────────────────── process ───────────────────────── */
  {
    title: "Proses Kerja (10 Tahap)",
    content:
      "Alur kerja PT Core Solution Digital: (1) Prospek masuk — chat/lead diterima oleh Nadia; (2) Discovery/konsultasi 30–60 menit; (3) Analisis kebutuhan 1–2 hari kerja; (4) Proposal & estimasi ±1 hari kerja setelah kebutuhan cukup jelas; (5) Approval & DP mengikuti keputusan klien; (6) Pengerjaan sesuai jenis dan scope; (7) Testing & revisi 2–5 hari kerja; (8) Pelunasan sebelum final deployment/handover; (9) Deployment & handover ±1 hari kerja; (10) Maintenance awal mengikuti paket (Custom Web Application: 3 bulan).",
    metadata: { category: "process" },
  },
  {
    title: "Aturan Timeline",
    content:
      "Nadia tidak boleh menjanjikan tanggal selesai pasti sebelum discovery, scope, dependency, dan technical assessment cukup jelas. Estimasi diberikan sebagai rentang berdasarkan jenis proyek dan bersifat indikatif sampai scope disepakati.",
    metadata: { category: "process", type: "rule" },
  },

  /* ───────────────────────── booking ───────────────────────── */
  {
    title: "Booking Konsultasi",
    content:
      "Flow booking: Prospek → Nadia → qualification awal → Cal.com → Google Calendar → Google Meet. Booking engine menggunakan Cal.com, ketersediaan jadwal dari Google Calendar, dan meeting dilakukan online via Google Meet. Konsultasi/discovery berdurasi 30–60 menit. Booking hanya diarahkan untuk prospek yang sudah cukup qualified.",
    metadata: { category: "booking" },
  },
  {
    title: "Data Qualification Minimum",
    content:
      "Data yang perlu digali sebelum mengarahkan prospek ke konsultasi: nama prospek/perusahaan; jenis bisnis; masalah utama yang ingin diselesaikan; proses yang saat ini berjalan; solusi/fitur yang diinginkan; sistem yang sudah digunakan (CRM, database, website, dll.); integrasi yang dibutuhkan; estimasi budget; target timeline; decision maker/pihak yang terlibat; dan preferensi jadwal konsultasi.",
    metadata: { category: "qualification" },
  },

  /* ─────────────────────────── FAQ ─────────────────────────── */
  {
    title: "FAQ: Berapa lama pengerjaan proyek?",
    content:
      "Pertanyaan: Berapa lama pengerjaan proyek?\nJawaban: Estimasi tergantung jenis dan kompleksitas proyek. Proyek sederhana biasanya 3–14 hari, sedangkan sistem custom atau kompleks dapat membutuhkan beberapa minggu. Estimasi final diberikan setelah kebutuhan dan scope dianalisis.",
    metadata: { category: "faq", topic: "timeline" },
  },
  {
    title: "FAQ: Apakah sistem bisa dibuat custom sesuai kebutuhan?",
    content:
      "Pertanyaan: Apakah sistem bisa dibuat custom sesuai kebutuhan bisnis?\nJawaban: Tentu. Sistem yang dibangun disesuaikan dengan kebutuhan dan alur kerja bisnis masing-masing klien. Sebelum mulai, kami pelajari proses yang saat ini berjalan, bagian yang masih manual atau tidak efisien, sistem yang perlu terhubung, dan hasil yang ingin dicapai. Dari situ kami tentukan solusi dan scope yang paling sesuai.",
    metadata: { category: "faq", topic: "custom" },
  },
  {
    title: "FAQ: Berapa kali revisi?",
    content:
      "Pertanyaan: Berapa kali revisi yang didapat?\nJawaban: Maksimal 2 kali revisi mayor pada scope yang sudah disepakati. Revisi minor seperti penyesuaian teks, posisi elemen, atau perubahan kecil tetap dapat dibantu selama masih dalam ruang lingkup proyek. Perubahan fitur atau alur di luar scope akan diinformasikan estimasi biaya dan waktunya terlebih dahulu.",
    metadata: { category: "faq", topic: "revision" },
  },
  {
    title: "FAQ: Maintenance setelah proyek selesai?",
    content:
      "Pertanyaan: Apakah ada maintenance setelah proyek selesai?\nJawaban: Ada. Untuk Custom Web Application Development, maintenance awal berlaku 3 bulan setelah handover untuk bug, kendala teknis, dan penyesuaian minor pada scope yang disepakati. Layanan lain mengikuti scope proyek. Support jangka panjang dapat ditawarkan terpisah.",
    metadata: { category: "faq", topic: "maintenance" },
  },
  {
    title: "FAQ: Apakah source code diberikan?",
    content:
      "Pertanyaan: Apakah source code diberikan?\nJawaban: Ya. Untuk proyek custom development, source code diserahkan setelah seluruh pembayaran selesai, beserta dokumentasi dasar dan panduan deployment sesuai scope. Komponen pihak ketiga tetap mengikuti lisensi masing-masing.",
    metadata: { category: "faq", topic: "source-code" },
  },
  {
    title: "FAQ: Bagaimana skema pembayarannya?",
    content:
      "Pertanyaan: Bagaimana skema pembayarannya?\nJawaban: Proyek standar: 50% DP, 30% setelah milestone utama/staging, 20% sebelum final deployment/handover. Proyek kecil Rp2–3 juta: 50% DP dan 50% setelah selesai.",
    metadata: { category: "faq", topic: "payment" },
  },
  {
    title: "FAQ: Bisa integrasi dengan sistem yang sudah kami gunakan?",
    content:
      "Pertanyaan: Apakah bisa integrasi dengan sistem yang sudah kami gunakan?\nJawaban: Bisa, selama sistem memiliki akses integrasi yang memungkinkan seperti API, webhook, database access, atau metode lain. Kami perlu mengecek sistem, dokumentasi API, dan alur data terlebih dahulu agar estimasi aman dan akurat. Nadia tidak memastikan integrasi dapat dilakukan sebelum API/akses diverifikasi.",
    metadata: { category: "faq", topic: "integration" },
  },
  {
    title: "FAQ: Apakah hosting, API AI, WhatsApp API, domain termasuk?",
    content:
      "Pertanyaan: Apakah biaya hosting, API AI, WhatsApp API, domain, dan layanan pihak ketiga sudah termasuk?\nJawaban: Belum. Harga development umumnya mencakup analisis, pembangunan, integrasi, testing, deployment, dan dokumentasi sesuai scope. Biaya operasional pihak ketiga dihitung terpisah dan akan diinformasikan sebelum proyek dimulai.",
    metadata: { category: "faq", topic: "third-party-cost" },
  },
  {
    title: "FAQ: Menambah fitur di tengah proyek?",
    content:
      "Pertanyaan: Kalau di tengah proyek saya ingin menambah fitur, apakah bisa?\nJawaban: Bisa. Kami cek dulu apakah masih masuk scope awal. Jika membutuhkan alur baru, integrasi tambahan, perubahan database, atau pekerjaan di luar kesepakatan awal, kami akan memberikan estimasi tambahan biaya dan waktu sebelum dikerjakan.",
    metadata: { category: "faq", topic: "scope-change" },
  },
  {
    title: "FAQ: Keamanan data dan akses sistem",
    content:
      "Pertanyaan: Bagaimana keamanan data dan akses sistem kami?\nJawaban: Keamanan data menjadi bagian penting dalam proyek. Kami menerapkan kontrol akses sesuai kebutuhan, pengelolaan credential terpisah, serta membatasi akses hanya pada sistem dan data yang diperlukan. Untuk data sensitif, arsitektur, logging, role-based access, penyimpanan data, dan NDA dapat disesuaikan. Nadia tidak meminta atau membagikan password, API key, token, atau credential sensitif melalui chat biasa.",
    metadata: { category: "faq", topic: "security" },
  },

  /* ───────────────────── objection handling ───────────────── */
  {
    title: "Keberatan: Harganya mahal",
    content:
      "Jika prospek mengatakan harga mahal: 'Saya memahami pertimbangannya, Bapak/Ibu. Harga kami dihitung berdasarkan scope, kompleksitas, serta hasil yang perlu dibangun dan diserahkan. Jika budget saat ini belum sesuai, kami bisa membantu mengecilkan scope terlebih dahulu dan memprioritaskan fitur yang paling berdampak. Kami juga memiliki opsi proyek kecil sekitar Rp2–3 juta untuk kebutuhan dengan scope terbatas.' Jangan memberi diskon langsung — prioritaskan penyesuaian scope.",
    metadata: { category: "objection", type: "price" },
  },
  {
    title: "Keberatan: Nanti saja / pikir-pikir dulu",
    content:
      "Jika prospek menunda: 'Tentu, Bapak/Ibu. Silakan dipertimbangkan terlebih dahulu. Sebelum itu, boleh saya bantu memastikan apakah yang masih menjadi pertimbangan adalah budget, kebutuhan fitur, waktu pengerjaan, atau keyakinan terhadap hasilnya? Jika berkenan, saya bisa bantu rangkum kebutuhan dan opsi solusi agar lebih mudah dibandingkan.'",
    metadata: { category: "objection", type: "timing" },
  },
  {
    title: "Keberatan: Belum yakin hasilnya sesuai",
    content:
      "Jika prospek ragu hasil: 'Wajar, Bapak/Ibu. Karena itu sebelum development dimulai, kami menyepakati scope, alur kerja, fitur utama, dan hasil yang ingin dicapai. Untuk proyek tertentu kami menggunakan milestone atau versi staging agar progres dapat divalidasi sebelum masuk tahap final.'",
    metadata: { category: "objection", type: "trust" },
  },
  {
    title: "Keberatan: Apa pembeda dibanding vendor lain?",
    content:
      "Jika prospek membandingkan dengan vendor lain: 'Setiap vendor memiliki pendekatan berbeda. Kami fokus pada solusi yang terhubung dengan proses operasional bisnis, bukan hanya membuat aplikasi atau AI sebagai fitur tambahan. Kami menggabungkan custom web development, AI automation, AI agent, dan system integration dalam satu proses sehingga aplikasi, database, workflow, API, dashboard, dan AI dapat dirancang sebagai satu sistem yang saling terhubung. Kami juga menggunakan discovery, milestone, staging, dokumentasi, dan handover.' Jangan menjelekkan kompetitor.",
    metadata: { category: "objection", type: "competitor" },
  },

  /* ───────────────────── warranty & refund ───────────────── */
  {
    title: "Garansi",
    content:
      "Garansi berlaku untuk perbaikan bug atau fungsi yang tidak berjalan sesuai scope dan spesifikasi yang disepakati, dan mengikuti periode maintenance pada paket/proposal. Untuk Custom Web Application Development, maintenance awal berlaku 3 bulan setelah handover. Garansi tidak mencakup: penambahan fitur baru atau perubahan scope; perubahan API/sistem pihak ketiga di luar kontrol perusahaan; masalah akibat perubahan dari pihak klien; dan biaya layanan eksternal seperti hosting dan API. Masalah yang termasuk scope garansi diperbaiki tanpa biaya development tambahan.",
    metadata: { category: "warranty" },
  },
  {
    title: "Pembatalan & Refund",
    content:
      "Jika proyek dibatalkan sebelum pengerjaan dimulai, dana dapat dikembalikan setelah dikurangi biaya administrasi atau pekerjaan persiapan yang sudah dilakukan. Jika pengerjaan sudah dimulai, DP tidak dapat dikembalikan. Pembayaran milestone berikutnya hanya dapat dipertimbangkan untuk refund pada bagian pekerjaan yang memang belum dikerjakan. Keterlambatan data, akses, approval, atau feedback dari klien dapat menggeser timeline dan tidak otomatis menjadi dasar refund. Jika PT Core Solution Digital tidak dapat melanjutkan proyek karena alasan dari pihak perusahaan, bagian pembayaran untuk pekerjaan yang belum diselesaikan dikembalikan secara proporsional.",
    metadata: { category: "refund" },
  },

  /* ───────────────────────── escalation ───────────────────── */
  {
    title: "Eskalasi ke Tim Manusia",
    content:
      "Eskalasi ke tim manusia jika: scope sangat kompleks; prospek meminta kontrak/NDA khusus; pertanyaan legal/pajak; integrasi belum jelas; keamanan/compliance sensitif; custom pricing besar; atau prospek meminta komitmen yang belum ada di knowledge base. Jika informasi tidak tersedia atau berisiko membuat janji yang salah, Nadia tidak boleh mengarang dan harus mengeskalasi ke tim manusia.",
    metadata: { category: "escalation" },
  },
  {
    title: "Guardrails Nadia (Yang Tidak Boleh Dilakukan)",
    content:
      "Nadia tidak boleh: menjanjikan harga final sebelum scope jelas; menjanjikan deadline pasti sebelum technical assessment; membuat promo/diskon/bundling sendiri; menjanjikan hasil bisnis seperti 'sales pasti naik', ROI tertentu, atau 'AI akurat 100%'; memastikan integrasi bisa sebelum mengecek API/akses; memberikan diskon langsung (prioritaskan penyesuaian scope); menerima perubahan scope tanpa menjelaskan dampak biaya dan timeline; meminta atau membagikan password/API key/token/credential sensitif lewat chat biasa; menjelekkan kompetitor; berpura-pura menjadi manusia jika ditanya langsung; memaksa prospek melakukan booking atau pembayaran; mengarang informasi teknis, harga, kebijakan, atau kemampuan di luar knowledge base.",
    metadata: { category: "policy", topic: "guardrails" },
  },
];
