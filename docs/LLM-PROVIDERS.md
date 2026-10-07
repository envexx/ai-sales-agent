# LLM Providers

Satu orkestrator (**LangGraph**), banyak pilihan "otak". Pemanggilan LLM
melewati `src/llm/index.ts`, yang memilih provider secara terpusat.

## Tiga provider

| Provider | Cara kerja | Cocok untuk |
| --- | --- | --- |
| `deepseek` (default) | `ChatOpenAI` → DeepSeek Chat Completions | Semua node; murah & cepat |
| `antigravity` | Antigravity CLI **headless**: `agy -p ... --output-format json --json-schema ...` | Node yang butuh penalaran kuat |
| `openrouter` | `ChatOpenAI` → OpenRouter (OpenAI-compatible), bisa model **gratis** | Alternatif hemat & fallback cepat |

Provider dipilih dengan `LLM_PROVIDER`, dan bisa di-*override* per node lewat
`LLM_PROVIDER_OVERRIDES` (berdasarkan `name` pemanggilan).

### Rantai fallback

Selain `LLM_FALLBACK_TO_DEEPSEEK`, ada `LLM_FALLBACK_PROVIDERS` (urut, dipisah
koma) yang dicoba **berurutan** setelah provider utama. Contoh:

```bash
# antigravity (utama) → OpenRouter → DeepSeek
LLM_FALLBACK_PROVIDERS=openrouter,deepseek
```

Provider tanpa kredensial otomatis dilewati (mis. OpenRouter tanpa API key).

## OpenRouter (model gratis)

```bash
# .env
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
# opsional
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_REFERER=https://localhost
OPENROUTER_TITLE=Sales Automation Agent
```

Model gratis terbaik (per `GET https://openrouter.ai/api/v1/models`, harga 0):
`nvidia/nemotron-3-ultra-550b-a55b:free` (1M ctx), `thinkingmachines/inkling:free`,
`google/gemma-4-31b-it:free`, `nvidia/nemotron-3.5-lightning:free`, dan
`openrouter/free` (router otomatis). Lihat daftar lengkap di
<https://openrouter.ai/models?max_price=0>.

> Model `:free` punya **rate limit** dan kadang tak stabil; karena itu fallback
> berlapis tetap disarankan. Structured output mencoba `functionCalling` →
> `jsonMode` → ekstraksi JSON (banyak model gratis tidak mendukung function calling).

## Cara pakai

```bash
# .env
LLM_PROVIDER=deepseek

# Pakai Antigravity hanya untuk routing supervisor + riset:
LLM_PROVIDER_OVERRIDES=SupervisorRoute=antigravity,ResearchPlan=antigravity,ResearchVerify=antigravity,ResearchReport=antigravity

LLM_FALLBACK_TO_DEEPSEEK=true
# opsional
ANTIGRAVITY_MODEL=gemini-3.8-flash-medium   # lihat `agy models`
ANTIGRAVITY_EFFORT=medium                   # low | medium | high
```

Nama (`name`) yang tersedia untuk override, antara lain:

| `name` | Node |
| --- | --- |
| `Triage` | Sales — triage |
| `LeadScoring`* | Sales — lead scoring |
| `ResponseGeneration` | Sales — penulisan balasan |
| `SupervisorRoute` | Supervisor — pemilihan agent |
| `ResearchPlan` | Riset — planner |
| `FactExtraction` | Riset — ekstraksi fakta |
| `ResearchVerify` | Riset — evaluator kedalaman |
| `ResearchReport` | Riset — formatter |

\* sesuaikan dengan `name` yang dipakai di node terkait.

## Perilaku & keamanan

- **Structured output**: untuk Antigravity, skema zod dikirim sebagai
  `--json-schema`; hasil diambil dari `structured_output`.
- **Fallback**: bila Antigravity gagal (CLI tidak ada, error, timeout) dan
  `LLM_FALLBACK_TO_DEEPSEEK=true`, pemanggilan otomatis diulang ke DeepSeek.
- **Anti-injeksi**: prompt dikirim sebagai argumen proses (array), bukan lewat
  shell, sehingga isi pesan pengguna tidak dieksekusi.
- **Auth**: headless memakai kredensial `agy` yang sudah login. Untuk headless
  murni/CI, gunakan Gemini API key (`modelProvider: "gemini"` + `GEMINI_API_KEY`)
  alih-alih sesi akun. Perhatikan ToS & kuota Antigravity.

## Status

`GET /llm/status` menampilkan provider aktif, override, dan apakah binary
`agy` tersedia. `GET /health` juga menyertakan ringkasan provider.

> Catatan: Antigravity CLI adalah *agent harness* (punya tool, permission,
> sandbox). Di sini kita memakainya sebagai penyedia **output LLM** (teks /
> structured), bukan sebagai orkestrator — orkestrasi tetap milik LangGraph.

## Catatan performa (hasil uji)

Menjalankan **satu turn Sales penuh** lewat Antigravity (`LLM_PROVIDER=antigravity`)
terukur **~235 detik**, karena setiap node LLM men-*spawn* proses `agy` (multi-step).
Untuk percakapan WhatsApp real-time itu terlalu lambat.

Rekomendasi: biarkan default `deepseek`, lalu aktifkan Antigravity hanya untuk
node yang benar-benar butuh penalaran kuat, mis.:

```bash
LLM_PROVIDER=deepseek
LLM_PROVIDER_OVERRIDES=ResearchVerify=antigravity,ResearchReport=antigravity
```

Dengan begitu pipeline chat tetap cepat, sementara tahap bernilai tinggi
(evaluasi kedalaman riset & penyusunan laporan) memakai model Gemini yang lebih kuat.
