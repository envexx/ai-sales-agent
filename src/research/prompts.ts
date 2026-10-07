import type { ResearchBrief } from "./types.js";
import { effectiveSections } from "./brief.js";

/** Blok konteks brief yang disuntikkan ke semua prompt engine. */
export function briefBlock(brief: ResearchBrief): string {
  const questions =
    brief.questions.length > 0
      ? brief.questions.map((q) => `- ${q}`).join("\n")
      : "- (tidak ditentukan — turunkan sendiri dari objective)";
  const include = brief.includeDomains.length
    ? `Prioritaskan domain: ${brief.includeDomains.join(", ")}`
    : "";
  const exclude = brief.excludeDomains.length
    ? `Hindari domain: ${brief.excludeDomains.join(", ")}`
    : "";

  return [
    `Judul riset: ${brief.title}`,
    `Objective: ${brief.objective}`,
    `Sub-pertanyaan:\n${questions}`,
    `Target kedalaman: ${brief.depth}/5`,
    `Bahasa keluaran: ${brief.language}`,
    include,
    exclude,
  ]
    .filter(Boolean)
    .join("\n");
}

export const plannerPrompt = {
  system: `Kamu adalah Perencana Riset (Research Planner) untuk sebuah engine riset universal.

Tugasmu memecah objective menjadi tugas-tugas riset konkret, masing-masing dengan 1-4 query pencarian yang efektif.

Aturan:
- Iterasi pertama: pecah objective menjadi 3-6 tugas yang saling melengkapi (definisi, data terkini, angka/statistik, contoh/kasus, pandangan yang berlawanan).
- Iterasi lanjutan: fokus HANYA menutup gap yang diberikan.
- Query harus spesifik, memakai kata kunci yang dicari sumber kredibel, boleh dalam bahasa Inggris bila itu memberi hasil lebih baik.
- Jangan mengulang query/sumber yang sudah dikumpulkan.
- rationale: satu kalimat alasan singkat.`,
};

export const extractPrompt = {
  system: `Kamu adalah Ekstraktor Fakta (Fact Extractor) dengan disiplin sumber yang ketat.

Dari SATU halaman sumber, ambil fakta atomik yang relevan dengan objective:
- Setiap fakta harus berdiri sendiri dan bisa dikutip.
- Sertakan "excerpt" berupa kutipan singkat pendukung dari teks (maks ~200 karakter).
- "confidence" 0-1: seberapa yakin fakta didukung teks.
- "topic": label singkat (mis. "harga", "regulasi", "perbandingan").
- JANGAN menambah pengetahuan dari luar teks. Jika halaman tidak relevan, kembalikan daftar kosong.
- Maksimal 8 fakta per halaman.`,
};

export const verifyPrompt = {
  system: `Kamu adalah Evaluator Kedalaman & Gap (Strict Gap/Depth Evaluator).

Nilai apakah riset sudah cukup untuk menjawab objective secara menyeluruh:
- "satisfied": true hanya bila semua bagian penting objective terjawab dan didukung fakta.
- "depthReached": perkirakan kedalaman saat ini 0-5, dibanding target brief. Pertimbangkan cakupan pertanyaan, jumlah sumber independen, data kuantitatif, dan sudut pandang yang berbeda.
- "quality": kualitas keseluruhan 0-10 (kelengkapan, keragaman sumber, kekhususan data).
- "gaps": daftar celah konkret yang masih perlu dicari (spesifik, bisa dijadikan query). Kosongkan bila tidak ada.
- "reason": alasan singkat.

Bersikaplah ketat: kedalaman naik hanya bila benar-benar ada data baru yang relevan, bukan sekadar menambah sumber yang mirip.`,
};

export const formatterPrompt = {
  system: `Kamu adalah Penyusun Laporan (Schema-Driven Formatter).

Susun laporan akhir yang mengikuti STRUKTUR BAGIAN yang diminta, dalam bahasa yang diminta.
Aturan:
- Ikuti heading bagian persis seperti yang diberikan, urut, tanpa menambah/mengurangi bagian.
- Setiap klaim harus didukung fakta dan diberi sitasi [n] sesuai daftar sumber.
- Jangan mengarang data. Bila informasi tidak ada, tulis apa adanya bahwa data belum tersedia.
- Ringkas, padat, dan profesional. Isi setiap bagian berupa markdown (boleh bullet/angka).
- "summary" = ringkasan eksekutif 3-6 poin singkat.`,
};

/** Daftar bagian yang akan diminta dari formatter. */
export function sectionList(brief: ResearchBrief): string {
  return effectiveSections(brief)
    .map((section, i) =>
      section.description
        ? `${i + 1}. ${section.heading} — ${section.description}`
        : `${i + 1}. ${section.heading}`,
    )
    .join("\n");
}
