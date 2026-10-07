import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Enkripsi kredensial (AES-256-GCM) untuk vault `credentials`.
 *
 * Kunci diturunkan dari `APP_SECRET` (SHA-256). Format keluaran:
 * `iv.tag.data` (base64). Tanpa APP_SECRET, vault tidak aktif.
 */
function key(): Buffer {
  if (!env.APP_SECRET) {
    throw new Error("APP_SECRET belum diisi — vault kredensial tidak aktif");
  }
  return createHash("sha256").update(env.APP_SECRET).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${data.toString("base64")}`;
}

export function decryptSecret(cipherText: string): string {
  const [ivB64, tagB64, dataB64] = cipherText.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("format kredensial tidak valid");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(value: string): string {
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}
