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
  // Sengaja di luar 3000/3001 agar tidak bentrok dengan sistem lain.
  PORT: int(4000),
  LOG_LEVEL: z.string().default("info"),

  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  DEEPSEEK_REASONING_MODEL: z.string().default("deepseek-reasoner"),
  USE_REASONING_MODEL: bool(false),

  /* ── LLM provider selection ───────────────────────────────── */
  // Provider default untuk semua pemanggilan LLM.
  LLM_PROVIDER: z.enum(["deepseek", "antigravity", "openrouter"]).default("deepseek"),
  // Override per-node berdasarkan `name`, mis. "SupervisorRoute=antigravity,ResearchPlan=antigravity".
  LLM_PROVIDER_OVERRIDES: z.string().default(""),
  // Bila provider antigravity gagal, otomatis kembali ke DeepSeek.
  LLM_FALLBACK_TO_DEEPSEEK: bool(true),
  // Rantai fallback berlapis (urut, dipisah koma), mis. "openrouter,deepseek".
  LLM_FALLBACK_PROVIDERS: z.string().default(""),

  /* ── Antigravity CLI (provider alternatif) ────────────────── */
  ANTIGRAVITY_ENABLED: bool(true),
  ANTIGRAVITY_BIN: z.string().default("agy"),
  // Kosong = pakai model default CLI (lihat `agy models`).
  ANTIGRAVITY_MODEL: z.string().default(""),
  ANTIGRAVITY_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
  ANTIGRAVITY_TIMEOUT_MS: int(180000),

  /* ── OpenRouter (provider OpenAI-compatible, bisa gratis) ─── */
  OPENROUTER_ENABLED: bool(true),
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  // Default: model gratis yang kuat (lihat https://openrouter.ai/models?max_price=0).
  OPENROUTER_MODEL: z.string().default("nvidia/nemotron-3-ultra-550b-a55b:free"),
  OPENROUTER_REFERER: z.string().default("https://localhost"),
  OPENROUTER_TITLE: z.string().default("Sales Automation Agent"),

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
  // Outbound reliability: tunggu koneksi sebentar, lalu coba ulang bila gagal.
  WA_SEND_CONNECT_TIMEOUT_MS: int(20000),
  WA_SEND_RETRIES: int(3),
  WA_SEND_RETRY_MS: int(3000),

  /* ── Media masuk: voice note → Whisper, gambar → DeepSeek vision ── */
  // Proses media hanya saat pesannya berupa voice note / gambar (lazy).
  MEDIA_ENABLED: bool(true),
  WHISPER_ENABLED: bool(true),
  // Python (yang punya paket `faster-whisper`). Lihat scripts/whisper_transcribe.py.
  WHISPER_PYTHON: z.string().default("python"),
  // Model faster-whisper (tiny|base|small|medium|large-v3). Diunduh saat pertama dipakai.
  WHISPER_MODEL: z.string().default("small"),
  WHISPER_LANGUAGE: z.string().default("id"),
  WHISPER_TIMEOUT_MS: int(180000),
  VISION_ENABLED: bool(true),
  // Kosong = pakai DEEPSEEK_MODEL (DeepSeek mendukung input gambar).
  VISION_MODEL: z.string().default(""),
  VISION_PROMPT: z
    .string()
    .default(
      "Jelaskan singkat isi gambar ini (produk, dokumen, atau tangkapan layar). Bila ada teks, tuliskan inti pesannya.",
    ),
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

  /* ── Supervisor orchestrator ─────────────────────────────── */
  // Paksa supervisor memakai LLM untuk routing walau baru ada satu agent.
  SUPERVISOR_FORCE_LLM: bool(false),

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

  /* ── Research Agent (Universal Research Engine) ───────────── */
  RESEARCH_ENABLED: bool(true),
  RESEARCH_WORKSPACE_DIR: z.string().default("./workspace/research"),
  RESEARCH_DEFAULT_DEPTH: int(2),
  RESEARCH_MAX_ITERATIONS: int(3),
  RESEARCH_MAX_SOURCES: int(12),
  RESEARCH_TIME_BUDGET_MS: int(240000),
  RESEARCH_PER_SOURCE_CHARS: int(8000),
  RESEARCH_MAX_FACTS: int(80),
  RESEARCH_CONCURRENCY: int(3),
  // Batas riset yang dipicu lewat chat/WhatsApp agar tidak memblokir turn lama.
  RESEARCH_CHAT_ENABLED: bool(true),
  RESEARCH_CHAT_MAX_ITERATIONS: int(1),
  RESEARCH_CHAT_MAX_SOURCES: int(5),
  RESEARCH_CHAT_TIME_BUDGET_MS: int(90000),

  /* ── Firecrawl (ingestion engine #1) ──────────────────────── */
  FIRECRAWL_ENABLED: bool(true),
  FIRECRAWL_BASE_URL: z.string().default("http://127.0.0.1:3002"),
  FIRECRAWL_API_KEY: z.string().default(""),
  // Sumber discovery: auto | tavily | searxng | firecrawl | bing | camoufox | none.
  // `auto` = Tavily (bila aktif) → SearXNG → Bing (Firecrawl) → Bing (Camoufox) → Firecrawl search.
  RESEARCH_SEARCH_PROVIDER: z
    .enum(["auto", "tavily", "searxng", "firecrawl", "bing", "camoufox", "none"])
    .default("auto"),
  // Endpoint SearXNG (JSON API). Default menunjuk proxy `searxng-proxy`.
  RESEARCH_SEARXNG_URL: z.string().default("http://127.0.0.1:8081"),

  /* ── Camoufox (ingestion engine #2, stealth browser) ──────── */
  CAMOUFOX_ENABLED: bool(true),
  CAMOUFOX_PYTHON: z.string().default("python"),
  CAMOUFOX_TIMEOUT_MS: int(45000),

  /* ── Tavily (search + extract untuk AI agent) ─────────────── */
  // Fungsi tambahan untuk Prospecting & Research: discovery yang lebih
  // andal + ekstraksi kontak dari situs resmi tanpa bergantung Firecrawl.
  TAVILY_ENABLED: bool(true),
  TAVILY_API_KEY: z.string().default(""),
  TAVILY_BASE_URL: z.string().default("https://api.tavily.com"),
  // basic | advanced (advanced lebih dalam, lebih mahal/lambat).
  TAVILY_SEARCH_DEPTH: z.enum(["basic", "advanced"]).default("basic"),
  TAVILY_EXTRACT_DEPTH: z.enum(["basic", "advanced"]).default("basic"),
  TAVILY_MAX_RESULTS: int(8),
  TAVILY_INCLUDE_RAW_CONTENT: bool(false),
  // Whitelist/blacklist domain (dipisah koma). Kosong = tanpa batasan.
  TAVILY_INCLUDE_DOMAINS: z.string().default(""),
  TAVILY_EXCLUDE_DOMAINS: z.string().default(""),

  /* ── Business pipeline orchestrator (F0) ──────────────────── */
  PIPELINE_ENABLED: bool(true),
  PIPELINE_TICK_SECONDS: int(30),
  PIPELINE_BATCH: int(5),
  PIPELINE_MAX_ATTEMPTS: int(3),
  // Notifikasi ke owner (Anda)
  NOTIFY_ENABLED: bool(true),
  OWNER_WA_JID: z.string().default(""),
  OWNER_NAME: z.string().default("Owner"),
  // Briefing harian
  BRIEFING_ENABLED: bool(true),
  BRIEFING_HOUR: int(8),
  BRIEFING_TIMEZONE: z.string().default("Asia/Jakarta"),
  // Loop perbaikan agent (agent.optimize) — harian, sebelum briefing.
  AGENT_OPTIMIZE_ENABLED: bool(true),
  AGENT_OPTIMIZE_HOUR: int(7),
  // Approval
  APPROVAL_TTL_HOURS: int(72),
  APPROVAL_PREFIX: z.string().default("APV"),
  // Vault kredensial (AES-256-GCM). Kosong = fitur vault nonaktif.
  APP_SECRET: z.string().default(""),

  /* ── Research Prospecting (D1) ────────────────────────────── */
  PROSPECTING_ENABLED: bool(true),
  PROSPECTING_DEFAULT_LIMIT: int(8),
  PROSPECTING_ENRICH: bool(true),
  PROSPECTING_WAIT_MS: int(6000),
  // Mode tepat sasaran: ambil N niche dari katalog (butuh otomasi, awam teknologi)
  // dan kecualikan bisnis yang bergerak di bidang teknologi.
  PROSPECTING_TARGET_COUNT: int(3),
  PROSPECTING_EXCLUDE_TECH: bool(true),
  // Target harian: kejar N lead tersimpan/hari (loop beberapa niche).
  PROSPECTING_DAILY_TARGET: int(20),
  PROSPECTING_NICHES_PER_ROUND: int(3),
  PROSPECTING_MAX_ROUNDS: int(8),
  // Target harian (F0.3). Hari-1 = stok awal, hari berikutnya = lead berkualitas.
  PROSPECTING_NICHE: z.string().default(""),
  PROSPECTING_LOCATION: z.string().default(""),
  PROSPECTING_DAY1_QUOTA: int(100),
  PROSPECTING_DAILY_QUOTA: int(5),
  PROSPECTING_HOUR: int(9),
  SCOUT_DAILY_QUOTA: int(15),
  SCOUT_HOUR: int(10),

  /* ── Scoper & PRD Builder (F2) ────────────────────────────── */
  SCOPER_ENABLED: bool(true),
  PROJECTS_WORKSPACE_DIR: z.string().default("./workspace/projects"),
  // Evaluasi & refleksi PRD (self-review). Revisi otomatis bila skor di bawah ambang.
  SCOPER_EVAL_ENABLED: bool(true),
  SCOPER_EVAL_MIN: int(7),
  SCOPER_MAX_REVISIONS: int(1),

  /* ── Legal & Finance (F2) ─────────────────────────────────── */
  LEGAL_ENABLED: bool(true),
  LEGAL_DUE_DAYS: int(7),

  /* ── F2–F5 agent toggles ──────────────────────────────────── */
  INTAKE_ENABLED: bool(true),
  INTAKE_LINK_TTL_HOURS: int(72),
  PUBLIC_BASE_URL: z.string().default(""),
  QA_ENABLED: bool(true),
  SCRIBE_ENABLED: bool(true),
  HANDOVER_ENABLED: bool(true),
  SUPPORT_ENABLED: bool(true),
  MONITOR_ENABLED: bool(true),
  CONTENT_ENABLED: bool(true),

  /* ── D4 · Developer Studio (engine: OpenCode; tools: GitHub dkk.) ── */
  DEVELOPER_ENABLED: bool(true),
  DEVELOPER_WORKSPACE_DIR: z.string().default("./workspace/developer"),
  // Engine OpenCode (headless `opencode run`).
  DEVELOPER_OPENCODE_BIN: z.string().default("opencode"),
  // Kosong = model default OpenCode. Format: provider/model (mis. deepseek/deepseek-chat).
  DEVELOPER_OPENCODE_MODEL: z.string().default(""),
  // Agent OpenCode (mis. build). Kosong = default.
  DEVELOPER_OPENCODE_AGENT: z.string().default(""),
  DEVELOPER_OPENCODE_TIMEOUT_MS: int(600000),
  // Jalankan `opencode run --standalone` (server privat) agar proses exit rapi.
  DEVELOPER_OPENCODE_STANDALONE: bool(true),
  DEVELOPER_SWEEP_ENABLED: bool(true),
  DEVELOPER_SWEEP_HOUR: int(11),
  DEVELOPER_MAX_PLAN_ITEMS: int(12),
  // Mode internal: repo & folder lokal sistem kita (untuk pekerjaan internal).
  DEVELOPER_INTERNAL_REPO: z.string().default(""),
  DEVELOPER_INTERNAL_LOCAL: z.string().default(""),
  // Full-auto internal: restart PM2 otomatis setelah perubahan diterapkan.
  DEVELOPER_INTERNAL_AUTORESTART: bool(false),
  // Kredensial platform developer (opsional; fitur aktif bila diisi).
  GITHUB_TOKEN: z.string().default(""),
  VERCEL_TOKEN: z.string().default(""),
  VERCEL_DEPLOY_HOOK_URL: z.string().default(""),
  CLOUDFLARE_API_TOKEN: z.string().default(""),
  CLOUDFLARE_ACCOUNT_ID: z.string().default(""),
  // Cloudflare R2 (S3-compatible): Access Key ID + Secret + endpoint S3 API.
  // Endpoint format: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().default(""),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().default(""),
  CLOUDFLARE_R2_ENDPOINT: z.string().default(""),
  CLOUDFLARE_R2_BUCKET: z.string().default(""),
  // Opsional: URL publik bucket (custom domain / r2.dev) untuk membagikan objek.
  CLOUDFLARE_R2_PUBLIC_URL: z.string().default(""),
  SUPABASE_ACCESS_TOKEN: z.string().default(""),
  SEARCH_CONSOLE_SITE_URL: z.string().default(""),
  SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON: z.string().default(""),
  PLAUSIBLE_API_TOKEN: z.string().default(""),
  PLAUSIBLE_SITE_ID: z.string().default(""),
  // Monitor: ambang peringatan (biaya/kuota disederhanakan).
  MONITOR_MEMORY_MB: int(1024),
  MONITOR_WEBHOOK_TIMEOUT_MS: int(5000),

  /* ── L1 Support: kanal klien (Telegram) ───────────────────── */
  // Default MATI: sesuai alur FLOW, klien berbicara lewat Sales;
  // L1 menjawab ke Sales lalu Sales meneruskan. Nyalakan hanya untuk
  // kanal opsional staf.
  TELEGRAM_ENABLED: bool(false),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  // Chat ID owner untuk laporan Supervisor/briefing via Telegram (opsional).
  TELEGRAM_OWNER_CHAT_ID: z.string().default(""),

  /* ── Bot Telegram khusus Developer (approval eksekusi) ────── */
  DEVELOPER_TELEGRAM_BOT_TOKEN: z.string().default(""),
  DEVELOPER_TELEGRAM_CHAT_ID: z.string().default(""),
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
