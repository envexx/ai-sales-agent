import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("integration:vision");

/**
 * Deskripsikan isi gambar memakai DeepSeek (mendukung input gambar).
 * Mengembalikan "" bila gagal/dinonaktifkan.
 */
export async function describeImage(
  buffer: Buffer,
  mimeType = "image/jpeg",
): Promise<string> {
  if (!env.VISION_ENABLED || !env.DEEPSEEK_API_KEY) return "";
  const model = env.VISION_MODEL || env.DEEPSEEK_MODEL;
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(`${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: env.VISION_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "vision request gagal");
      return "";
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return (json.choices?.[0]?.message?.content ?? "").trim();
  } catch (err) {
    log.warn({ err: (err as Error).message }, "vision error");
    return "";
  } finally {
    clearTimeout(timer);
  }
}
