import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("embedding");

/**
 * Pluggable embedding layer.
 *
 * DeepSeek does not expose an embeddings endpoint, so the default provider is
 * `hash`: a deterministic, zero-dependency bag-of-words/trigram embedding that
 * keeps the whole pipeline runnable offline. Switch to `local`
 * (@huggingface/transformers) or `openai` (any OpenAI-compatible endpoint) for
 * production-grade semantic retrieval.
 */
export interface Embedder {
  readonly name: string;
  readonly dim: number;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

/* ───────────────────────────── hash ───────────────────────────── */

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function l2normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Deterministic hashing embedder. Combines word unigrams, word bigrams and
 * character trigrams so near-duplicate phrasing lands close together.
 */
function hashEmbed(text: string, dim: number): number[] {
  const vec = new Array<number>(dim).fill(0);
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (words.length === 0) return vec;

  const add = (key: string, weight: number) => {
    const idx = fnv1a(key) % dim;
    vec[idx] = (vec[idx] ?? 0) + weight;
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    add(`w:${w}`, 1);
    if (i > 0) add(`b:${words[i - 1]}:${w}`, 0.7);
    const padded = `^${w}$`;
    for (let j = 0; j < padded.length - 2; j++) {
      add(`c:${padded.slice(j, j + 3)}`, 0.25);
    }
  }
  return l2normalize(vec);
}

class HashEmbedder implements Embedder {
  readonly name = "hash";
  constructor(readonly dim: number) {}
  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((t) => hashEmbed(t, this.dim));
  }
  async embedQuery(text: string): Promise<number[]> {
    return hashEmbed(text, this.dim);
  }
}

/* ───────────────────────────── local ──────────────────────────── */

type FeatureExtractionPipeline = (
  input: string | string[],
  options?: Record<string, unknown>,
) => Promise<{ tolist(): number[][] | number[] } | number[][]>;

class LocalEmbedder implements Embedder {
  readonly name = "local";
  private pipe: FeatureExtractionPipeline | null = null;
  constructor(
    readonly dim: number,
    private readonly model: string,
  ) {}

  private async getPipe(): Promise<FeatureExtractionPipeline> {
    if (this.pipe) return this.pipe;
    // Dynamic import so the optional dependency is only required when used.
    const mod = (await import("@huggingface/transformers")) as unknown as {
      pipeline: (task: string, model: string) => Promise<unknown>;
    };
    this.pipe = (await mod.pipeline(
      "feature-extraction",
      this.model,
    )) as FeatureExtractionPipeline;
    return this.pipe;
  }

  private async run(texts: string[]): Promise<number[][]> {
    const pipe = await this.getPipe();
    const out = await pipe(texts, { pooling: "mean", normalize: true });
    if (Array.isArray(out)) return out as unknown as number[][];
    const list = (out as { tolist(): number[][] | number[] }).tolist();
    return Array.isArray(list[0]) ? (list as number[][]) : [list as number[]];
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.run(texts);
  }
  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.run([text]);
    return v!;
  }
}

/* ───────────────────────────── openai ─────────────────────────── */

class OpenAIEmbedder implements Embedder {
  readonly name = "openai";
  constructor(
    readonly dim: number,
    private readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async call(input: string[]): Promise<number[][]> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/embeddings`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input }),
    });
    if (!res.ok) {
      throw new Error(`Embeddings request failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return this.call(texts);
  }
  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.call([text]);
    return v!;
  }
}

/* ─────────────────────────── factory ──────────────────────────── */

let cached: Embedder | null = null;

export function getEmbedder(): Embedder {
  if (cached) return cached;
  const dim = env.EMBEDDING_DIM;
  switch (env.EMBEDDING_PROVIDER) {
    case "local":
      log.info({ model: env.EMBEDDING_MODEL }, "using local embedding model");
      cached = new LocalEmbedder(dim, env.EMBEDDING_MODEL);
      break;
    case "openai":
      if (!env.EMBEDDING_BASE_URL || !env.EMBEDDING_API_KEY) {
        throw new Error(
          "EMBEDDING_PROVIDER=openai requires EMBEDDING_BASE_URL and EMBEDDING_API_KEY",
        );
      }
      cached = new OpenAIEmbedder(
        dim,
        env.EMBEDDING_MODEL,
        env.EMBEDDING_BASE_URL,
        env.EMBEDDING_API_KEY,
      );
      break;
    case "hash":
    default:
      cached = new HashEmbedder(dim);
      break;
  }
  return cached;
}

/** pgvector accepts the textual representation of a vector. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.map((v) => (Number.isFinite(v) ? v : 0)).join(",")}]`;
}
