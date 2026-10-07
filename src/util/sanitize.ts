/**
 * Guard against placeholder values leaking into customer-facing messages.
 *
 * The knowledge base ships with example values (`https://cal.com/your-booking-link`,
 * `<fill-me>`, …). If a placeholder was never replaced, we must not send it to a
 * real prospect — so we both hide it from the prompt and strip it from output.
 */
const PLACEHOLDER_TOKENS = [
  "your-booking-link",
  "your-booking",
  "your-booking-url",
  "<fill-me>",
  "fill-me",
  "example.com",
  "/acme/",
  "xxxx",
  "placeholder",
  "lorem",
];

export function isPlaceholderValue(value: string | null | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return true;
  return PLACEHOLDER_TOKENS.some((token) => v.includes(token));
}

/** True when the configured booking link is safe to send. */
export function hasUsableBookingLink(link: string): boolean {
  return !isPlaceholderValue(link) && /^https?:\/\//i.test(link.trim());
}

/**
 * Remove any URL that still looks like a placeholder, and tidy the sentence
 * left behind (e.g. "… ngobrol singkat di ." → "…").
 */
export function stripPlaceholderUrls(text: string): string {
  const cleaned = text.replace(/https?:\/\/[^\s)]+/g, (url) =>
    isPlaceholderValue(url) ? "\u0000" : url,
  );

  return cleaned
    .replace(/\s*\b(di|pada|via|ke|lewat)?\s*\u0000/g, "")
    .replace(/\u0000/g, "")
    // standalone placeholder tokens that are not URLs
    .replace(/<[^>]*fill[-_ ]?me[^>]*>/gi, "")
    .replace(/\bplaceholder\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
}
