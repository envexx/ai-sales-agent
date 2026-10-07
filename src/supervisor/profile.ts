import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Profil owner (tujuan, prioritas, batasan, gaya) yang dibaca Supervisor agar
 * sarannya selaras dengan keinginan Anda. Disimpan sebagai file markdown supaya
 * mudah Anda sunting.
 */
const PROFILE_PATH = () =>
  resolve(process.cwd(), "workspace", "owner", "profile.md");

const DEFAULT_PROFILE = `# Profil & Tujuan Owner

## Tentang saya
- Nama owner: (isi, mis. Nugrah)
- Peran: pemilik / pengambil keputusan

## Tujuan bisnis (yang saya inginkan)
- (isi) mis. dapat 20 klien berkualitas/bulan di Batam
- (isi) mis. sistem berjalan makin otomatis, saya cukup mengawasi
- (isi) mis. pendapatan naik tanpa menambah banyak staf

## Prioritas saat ini
1. (isi) mis. penuhi pipeline prospecting
2. (isi) mis. naikkan rasio balasan & booking

## Batasan / hal yang dihindari
- (isi) mis. jangan kirim pesan massal di luar jam kerja
- (isi) mis. harga tidak diskon, kurangi scope saja

## Preferensi gaya saran
- Bahasa: Indonesia, ringkas, langsung ke inti
- Sertakan langkah konkret + alasan

## Catatan
- (isi apa pun yang penting agar saran Supervisor tepat)
`;

export async function getOwnerProfile(): Promise<string> {
  try {
    return await readFile(PROFILE_PATH(), "utf8");
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function setOwnerProfile(text: string): Promise<void> {
  const path = PROFILE_PATH();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}
