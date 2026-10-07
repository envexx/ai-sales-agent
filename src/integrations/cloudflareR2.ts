import { createHash, createHmac } from "node:crypto";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("integrations:cloudflare-r2");

/**
 * Cloudflare **R2** (penyimpanan objek S3-compatible) untuk agent Developer.
 *
 * R2 memakai AWS Signature V4. Agar tidak menambah dependensi, penandatanganan
 * diimplementasikan sendiri di sini (`node:crypto`) → cukup `fetch` untuk
 * operasi dasar: list, put, get, delete, plus URL publik (opsional).
 *
 * Konfigurasi `.env`:
 *   CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY,
 *   CLOUDFLARE_R2_ENDPOINT (https://<acct>.r2.cloudflarestorage.com),
 *   CLOUDFLARE_R2_BUCKET, CLOUDFLARE_R2_PUBLIC_URL (opsional).
 */

const REGION = "auto";
const SERVICE = "s3";

export function r2Configured(): boolean {
  return Boolean(
    env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      env.CLOUDFLARE_R2_ENDPOINT &&
      env.CLOUDFLARE_R2_BUCKET,
  );
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** RFC3986 (encodeURIComponent + escape karakter yang masih tersisa). */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function amzDates(now = new Date()): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

interface S3Request {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  /** Object key (tanpa bucket). Kosong = operasi level bucket (list). */
  key?: string;
  query?: Record<string, string>;
  body?: string | Uint8Array;
  contentType?: string;
}

/** Lakukan satu permintaan S3 bertanda tangan SigV4 ke R2. */
async function s3Request(opts: S3Request): Promise<Response> {
  if (!r2Configured()) throw new Error("Cloudflare R2 belum dikonfigurasi (isi variabel CLOUDFLARE_R2_*)");

  const endpoint = new URL(env.CLOUDFLARE_R2_ENDPOINT);
  const host = endpoint.host;
  const { amzDate, dateStamp } = amzDates();

  const objectPath = opts.key
    ? `/${env.CLOUDFLARE_R2_BUCKET}/${opts.key.split("/").map(rfc3986).join("/")}`
    : `/${env.CLOUDFLARE_R2_BUCKET}`;

  const body = opts.body === undefined ? Buffer.alloc(0) : Buffer.from(opts.body);
  const payloadHash = sha256Hex(body);

  const query = opts.query ?? {};
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k] ?? "")}`)
    .join("&");

  const signedHeaderMap: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (opts.contentType) signedHeaderMap["content-type"] = opts.contentType;

  const signedHeaderKeys = Object.keys(signedHeaderMap).sort();
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${signedHeaderMap[k]}\n`)
    .join("");
  const signedHeaders = signedHeaderKeys.join(";");

  const canonicalRequest = [
    opts.method,
    objectPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${env.CLOUDFLARE_R2_SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${env.CLOUDFLARE_R2_ACCESS_KEY_ID}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `${endpoint.origin}${objectPath}${canonicalQuery ? `?${canonicalQuery}` : ""}`;

  // Catatan: header `host` dipakai untuk tanda tangan tetapi tidak boleh di-set
  // manual (undici mengisinya dari URL).
  const headers: Record<string, string> = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: authorization,
  };
  if (opts.contentType) headers["content-type"] = opts.contentType;

  const init: RequestInit = { method: opts.method, headers };
  if (opts.method === "PUT") init.body = body;

  return fetch(url, init);
}

export interface R2Object {
  key: string;
  size: number;
  lastModified: string | null;
}

function parseListObjects(xml: string): R2Object[] {
  const out: R2Object[] = [];
  const contents = xml.split("<Contents>").slice(1);
  for (const chunk of contents) {
    const key = chunk.match(/<Key>([^<]*)<\/Key>/)?.[1] ?? "";
    const size = Number(chunk.match(/<Size>([^<]*)<\/Size>/)?.[1] ?? 0);
    const lastModified = chunk.match(/<LastModified>([^<]*)<\/LastModified>/)?.[1] ?? null;
    if (key) out.push({ key, size, lastModified });
  }
  return out;
}

/** Daftar objek pada bucket (opsional per prefix). */
export async function r2ListObjects(
  opts: { prefix?: string; max?: number } = {},
): Promise<R2Object[]> {
  const query: Record<string, string> = { "list-type": "2" };
  if (opts.prefix) query.prefix = opts.prefix;
  query["max-keys"] = String(opts.max ?? 100);

  const res = await s3Request({ method: "GET", query });
  const text = await res.text();
  if (!res.ok) throw new Error(`R2 list ${res.status}: ${text.slice(0, 200)}`);
  return parseListObjects(text);
}

/** Unggah objek (teks/biner). */
export async function r2PutObject(
  key: string,
  body: string | Uint8Array,
  contentType = "application/octet-stream",
): Promise<{ key: string; bytes: number }> {
  const res = await s3Request({ method: "PUT", key, body, contentType });
  const text = await res.text();
  if (!res.ok) throw new Error(`R2 put ${res.status}: ${text.slice(0, 200)}`);
  const bytes = typeof body === "string" ? Buffer.byteLength(body) : body.length;
  log.info({ key, bytes }, "objek R2 diunggah");
  return { key, bytes };
}

/** Ambil objek sebagai teks (untuk artefak teks/Markdown/JSON). */
export async function r2GetObject(
  key: string,
): Promise<{ key: string; contentType: string | null; text: string }> {
  const res = await s3Request({ method: "GET", key });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`R2 get ${res.status}: ${err.slice(0, 200)}`);
  }
  return {
    key,
    contentType: res.headers.get("content-type"),
    text: await res.text(),
  };
}

/** Hapus objek. */
export async function r2DeleteObject(key: string): Promise<void> {
  const res = await s3Request({ method: "DELETE", key });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`R2 delete ${res.status}: ${err.slice(0, 200)}`);
  }
  log.info({ key }, "objek R2 dihapus");
}

/** URL publik objek (bila `CLOUDFLARE_R2_PUBLIC_URL` diisi). */
export function r2PublicUrl(key: string): string | null {
  if (!env.CLOUDFLARE_R2_PUBLIC_URL) return null;
  return `${env.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, "")}/${key.split("/").map(rfc3986).join("/")}`;
}
