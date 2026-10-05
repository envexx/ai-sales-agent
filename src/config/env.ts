import "dotenv/config";
import { z } from "zod";

/** Parse a boolean from the many shapes env vars arrive in. */
const bool = (def: boolean) =>
  z.preprocess((v) => {
    if (typeof v === "boolean") return v;
    if (v === undefined || v === null || v === "") return def;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
    return def;
  }, z.boolean());

const int = (def: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }, z.number().int());

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: int(3000),
  LOG_LEVEL: z.string().default("info"),

  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  DEEPSEEK_REASONING_MODEL: z.string().default("deepseek-reasoner"),
  USE_REASONING_MODEL: bool(false),

  DATABASE_URL: z
    .string()
    .default("postgres://sales:sales@localhost:5432/sales"),
  CHECKPOINT_SCHEMA: z.string().default("public"),

  EMBEDDING_PROVIDER: z.enum(["hash", "local", "openai"]).default("hash"),
  EMBEDDING_DIM: int(384),
  EMBEDDING_MODEL: z.string().default("Xenova/all-MiniLM-L6-v2"),
  EMBEDDING_BASE_URL: z.string().default(""),
  EMBEDDING_API_KEY: z.string().default(""),

  WA_TRANSPORT: z.enum(["console", "baileys"]).default("console"),
  WA_AUTH_DIR: z.string().default("./baileys_auth"),
  // Connect the WhatsApp socket automatically on boot (when transport=baileys).
  WA_AUTO_CONNECT: bool(true),
  WA_DEFAULT_COUNTRY_CODE: z.string().default("62"),
  // Show "sedang menulis…" and pace the send to the message length so the
  // agent does not look like an instant bot.
  WA_TYPING_ENABLED: bool(true),
  WA_TYPING_CPS: int(11), // characters per second
  WA_TYPING_MIN_MS: int(1200),
  WA_TYPING_MAX_MS: int(12000),
  WA_READ_RECEIPTS: bool(true),
  DRY_RUN: bool(true),

  /* ── Outbound prospecting / working hours ─────────────────── */
  OUTREACH_ENABLED: bool(true),
  // Working window in WORK_TIMEZONE (24h clock). Default 08:00–17:00.
  WORK_START_HOUR: int(8),
  WORK_END_HOUR: int(17),
  // ISO weekdays, Monday = 1 … Sunday = 7.
  WORK_DAYS: z.string().default("1,2,3,4,5"),
  WORK_TIMEZONE: z.string().default("Asia/Jakarta"),
  // How often the scheduler wakes up.
  OUTREACH_TICK_SECONDS: int(60),
  // Max prospects contacted per tick.
  OUTREACH_BATCH: int(3),
  // Max attempts per prospect (1 opening + follow-ups).
  OUTREACH_MAX_ATTEMPTS: int(2),
  // Delay between two outbound messages inside one tick.
  OUTREACH_DELAY_MS: int(20000),
  // Hours to wait before the follow-up attempt.
  OUTREACH_FOLLOWUP_HOURS: int(48),

  RAG_TOP_K: int(5),
  LTM_TOP_K: int(3),
  MAX_REFLECTION_LOOPS: int(0),
  SCORE_THRESHOLD_LOW: int(40),
  SCORE_THRESHOLD_HIGH: int(75),

  BUSINESS_NAME: z.string().default("Acme Digital"),
  BUSINESS_DESCRIPTION: z.string().default("A digital agency for SMEs."),
  SALES_REP_NAME: z.string().default("Rina"),
  BOOKING_LINK: z.string().default("https://cal.com/acme/intro"),

  API_KEY: z.string().default(""),
  // Comma-separated list of allowed origins, or "*" for all (development).
  CORS_ORIGIN: z.string().default("*"),

  /* ── Cal.com MCP (scheduling) ─────────────────────────────── */
  // Cal.com API key (cal_live_...). Enables the stdio MCP server.
  CAL_API_KEY: z.string().default(""),
  // Optional hosted MCP URL (https://mcp.cal.com/mcp). Takes precedence.
  CAL_MCP_URL: z.string().default(""),
  // Expose every Cal.com API tool (needed for getAvailableSlots).
  CAL_MCP_ALL_TOOLS: bool(true),
  // Default event type used when creating a booking. Empty = let the agent find it.
  CAL_EVENT_TYPE_ID: z.string().default(""),
  CAL_TIMEZONE: z.string().default("Asia/Jakarta"),
  // How many days ahead to look for available slots.
  CAL_SLOT_DAYS: int(7),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "❌ Invalid environment configuration:\n",
    z.treeifyError(parsed.error),
  );
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
