import { z } from "zod";

/**
 * Lead intake for `POST /webhook/leads`.
 *
 * Integrations rarely agree on field names, so the endpoint accepts common
 * aliases (English & Indonesian), several body shapes, and returns precise
 * per-field validation errors.
 */

export const LEAD_FIELD_ALIASES: Record<string, string[]> = {
  phone: [
    "phone", "whatsapp", "wa", "number", "phone_number", "phoneNumber",
    "nomor", "no_hp", "noHp", "msisdn", "tel", "telepon",
  ],
  name: ["name", "nama", "full_name", "fullName", "contact_name", "contactName", "kontak"],
  company: [
    "company", "perusahaan", "organization", "organisasi", "business", "bisnis",
    "company_name", "companyName",
  ],
  source: ["source", "sumber", "channel", "asal", "utm_source"],
  notes: [
    "notes", "note", "catatan", "keterangan", "description", "desc",
    "pesan", "message", "context", "kebutuhan",
  ],
  tags: ["tags", "label", "labels", "tag"],
  countryCode: ["countryCode", "country_code", "kode_negara", "cc"],
  queue: ["queue", "antre", "antri", "outreach"],
};

/** Human/machine-readable field spec, served by GET /webhook/leads/schema. */
export const LEAD_FIELD_SPEC = [
  {
    name: "phone",
    type: "string",
    required: true,
    aliases: LEAD_FIELD_ALIASES.phone,
    description:
      "Nomor WhatsApp. Format bebas: 0812…, +62 812…, 62812…, atau JID penuh. Dinormalisasi otomatis.",
    example: "081298765432",
  },
  {
    name: "name",
    type: "string | null",
    required: false,
    aliases: LEAD_FIELD_ALIASES.name,
    description: "Nama kontak. Dipakai agen untuk menyapa.",
    example: "Budi Santoso",
  },
  {
    name: "company",
    type: "string | null",
    required: false,
    aliases: LEAD_FIELD_ALIASES.company,
    description: "Nama perusahaan. Dipakai untuk personalisasi pesan outreach.",
    example: "CV Sinar Abadi",
  },
  {
    name: "source",
    type: "string | null",
    required: false,
    aliases: LEAD_FIELD_ALIASES.source,
    description: "Asal lead (instagram, referral, website, dsb).",
    example: "instagram",
  },
  {
    name: "notes",
    type: "string | null",
    required: false,
    aliases: LEAD_FIELD_ALIASES.notes,
    description: "Catatan/kebutuhan dari tim. Menjadi konteks untuk pesan pembuka.",
    example: "Order masih manual via Excel",
  },
  {
    name: "tags",
    type: "string[]",
    required: false,
    aliases: LEAD_FIELD_ALIASES.tags,
    description: "Label bebas; string dipisah koma juga diterima. Disimpan di leads.meta.tags.",
    example: ["prioritas-tinggi", "logistik"],
  },
  {
    name: "countryCode",
    type: "string | null",
    required: false,
    aliases: LEAD_FIELD_ALIASES.countryCode,
    description: "Kode negara untuk normalisasi nomor. Default dari WA_DEFAULT_COUNTRY_CODE.",
    example: "62",
  },
  {
    name: "queue",
    type: "boolean",
    required: false,
    aliases: LEAD_FIELD_ALIASES.queue,
    description: "true (default) = langsung masuk antrean outreach; false = simpan saja.",
    example: true,
  },
] as const;

const pickField = (obj: Record<string, unknown>, key: string): unknown => {
  for (const alias of LEAD_FIELD_ALIASES[key] ?? [key]) {
    const value = obj[alias];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const asString = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
};

const asBool = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "ya", "y", "on"].includes(value.trim().toLowerCase());
  }
  return fallback;
};

const asTags = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

/** Map any accepted alias shape onto the canonical lead shape. */
export function normalizeLead(raw: unknown): Record<string, unknown> {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    phone: asString(pickField(obj, "phone")),
    name: asString(pickField(obj, "name")),
    company: asString(pickField(obj, "company")),
    source: asString(pickField(obj, "source")),
    notes: asString(pickField(obj, "notes")),
    tags: asTags(pickField(obj, "tags")),
    countryCode: asString(pickField(obj, "countryCode")),
    queue: asBool(pickField(obj, "queue"), true),
  };
}

export const LeadItemSchema = z.object({
  phone: z
    .string({ error: "nomor wajib diisi dan tidak boleh kosong" })
    .trim()
    .min(5, "nomor terlalu pendek, minimal 5 karakter"),
  name: z.string().nullish(),
  company: z.string().nullish(),
  source: z.string().nullish(),
  notes: z.string().nullish(),
  tags: z.array(z.string()).default([]),
  countryCode: z.string().nullish(),
  queue: z.boolean().default(true),
});

export type LeadItem = z.infer<typeof LeadItemSchema>;

/** Accepted body shapes: single object, bare array, or `{ leads: [...] }`. */
export function extractLeadItems(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const leads = (body as Record<string, unknown>).leads;
    if (Array.isArray(leads)) return leads;
    return [body];
  }
  return null;
}

export interface LeadItemError {
  index: number;
  phone: string | null;
  errors: { field: string; message: string }[];
}

/** Validate one raw item, returning either the cleaned lead or field errors. */
export function validateLeadItem(
  raw: unknown,
  index: number,
): { ok: true; lead: LeadItem } | { ok: false; error: LeadItemError } {
  const normalized = normalizeLead(raw);
  const parsed = LeadItemSchema.safeParse(normalized);
  if (parsed.success) return { ok: true, lead: parsed.data };

  return {
    ok: false,
    error: {
      index,
      phone: typeof normalized.phone === "string" ? normalized.phone : null,
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    },
  };
}
