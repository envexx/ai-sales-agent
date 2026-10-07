import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  type BaseMessage,
  type MessageContent,
} from "@langchain/core/messages";
import type { StructuredOutputMethodOptions } from "@langchain/core/language_models/base";
import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { antigravityRun } from "./antigravity.js";

const log = loggerFor("llm");

export type LlmProvider = "deepseek" | "antigravity" | "openrouter";

export interface ModelOptions {
  temperature?: number;
  model?: string;
  maxTokens?: number;
  /** Route to the reasoning model (deepseek-reasoner) when enabled in env. */
  reasoning?: boolean;
  /** Paksa provider untuk pemanggilan ini (default: LLM_PROVIDER/override). */
  provider?: LlmProvider;
}

/* ────────────────────────── DeepSeek (default) ─────────────────────── */

/**
 * Returns a ChatOpenAI client pointed at DeepSeek.
 *
 * DeepSeek only implements the OpenAI *Chat Completions* API, so we must
 * disable the Responses API (`useResponsesApi: false`) — otherwise the
 * client calls `/responses` and DeepSeek returns a 404.
 */
export function getChatModel(opts: ModelOptions = {}): ChatOpenAI {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Copy .env.example to .env and add your DeepSeek API key.",
    );
  }
  const useReasoning = (opts.reasoning ?? false) && env.USE_REASONING_MODEL;
  const model =
    opts.model ??
    (useReasoning ? env.DEEPSEEK_REASONING_MODEL : env.DEEPSEEK_MODEL);

  return new ChatOpenAI({
    model,
    temperature: opts.temperature ?? 0.3,
    maxTokens: opts.maxTokens,
    apiKey: env.DEEPSEEK_API_KEY,
    useResponsesApi: false,
    configuration: { baseURL: env.DEEPSEEK_BASE_URL },
    maxRetries: 2,
  });
}

/* ────────────────────────── OpenRouter (gratis) ────────────────────── */

/**
 * Returns a ChatOpenAI client pointed at OpenRouter (OpenAI-compatible).
 *
 * Banyak model `:free` di OpenRouter tidak mendukung function calling, jadi
 * `structuredVia` menyediakan fallback ke JSON extraction.
 */
export function getOpenRouterModel(opts: ModelOptions = {}): ChatOpenAI {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to .env to use the OpenRouter provider.",
    );
  }
  return new ChatOpenAI({
    model: opts.model ?? env.OPENROUTER_MODEL,
    temperature: opts.temperature ?? 0.3,
    maxTokens: opts.maxTokens,
    apiKey: env.OPENROUTER_API_KEY,
    useResponsesApi: false,
    configuration: {
      baseURL: env.OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": env.OPENROUTER_REFERER,
        "X-Title": env.OPENROUTER_TITLE,
      },
    },
    maxRetries: 2,
  });
}

/* ────────────────────────── provider routing ───────────────────────── */

let overrideCache: Map<string, LlmProvider> | null = null;

/** `LLM_PROVIDER_OVERRIDES="SupervisorRoute=antigravity,ResearchPlan=antigravity"`. */
function providerOverrides(): Map<string, LlmProvider> {
  if (overrideCache) return overrideCache;
  const map = new Map<string, LlmProvider>();
  for (const pair of env.LLM_PROVIDER_OVERRIDES.split(",")) {
    const [key, value] = pair.split("=").map((part) => part.trim());
    if (key && (value === "deepseek" || value === "antigravity" || value === "openrouter")) {
      map.set(key, value);
    }
  }
  overrideCache = map;
  return map;
}

/** Provider efektif: eksplisit → override berdasarkan `name` → global. */
export function resolveProvider(name?: string, explicit?: LlmProvider): LlmProvider {
  if (explicit) return explicit;
  if (name) {
    const override = providerOverrides().get(name);
    if (override) return override;
  }
  return env.LLM_PROVIDER;
}

/* ─────────────────────────── shared helpers ────────────────────────── */

/** Flatten LangChain message content into a plain string. */
export function contentToString(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if ("text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("");
}

function schemaHint(schema: z.ZodType<unknown>): string {
  const json = toJsonSchemaSafe(schema);
  return json ? JSON.stringify(json, null, 2) : "{}";
}

/** zod → JSON Schema bila versi zod mendukung; selain itu undefined. */
function toJsonSchemaSafe(schema: z.ZodType<unknown>): unknown | undefined {
  try {
    const zz = z as unknown as { toJSONSchema?: (s: z.ZodType<unknown>) => unknown };
    if (typeof zz.toJSONSchema === "function") return zz.toJSONSchema(schema);
  } catch {
    /* ignore */
  }
  return undefined;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model output did not contain a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Extract the first JSON object from arbitrary text, or null. */
export function tryExtractJson(text: string): unknown | null {
  try {
    return extractJson(text);
  } catch {
    return null;
  }
}

/* ──────────────────────── structured output ────────────────────────── */

export interface StructuredArgs<T> {
  schema: z.ZodType<T>;
  system: string;
  human: string;
  name?: string;
  temperature?: number;
  model?: string;
  maxTokens?: number;
  reasoning?: boolean;
  provider?: LlmProvider;
}

/**
 * DeepSeek structured output, tried in order.
 *
 * LangChain's default is `jsonSchema`, which DeepSeek rejects; DeepSeek
 * supports function calling and `json_object`, so we try those first and only
 * then fall back to plain completion + JSON extraction.
 */
const STRUCTURED_METHODS: Array<
  NonNullable<StructuredOutputMethodOptions<false>["method"]>
> = ["functionCalling", "jsonMode"];

async function structuredVia<T>(
  getClient: (opts: ModelOptions) => ChatOpenAI,
  args: StructuredArgs<T>,
): Promise<T> {
  const { schema, system, human, name = "Output", temperature, model, reasoning, maxTokens } = args;
  const clientOpts: ModelOptions = { temperature, model, reasoning, maxTokens };
  const llm = getClient(clientOpts);
  const messages: BaseMessage[] = [new SystemMessage(system), new HumanMessage(human)];

  let lastError: unknown;
  for (const method of STRUCTURED_METHODS) {
    try {
      const runner = llm.withStructuredOutput(schema, { name, method });
      const out = await runner.invoke(messages);
      return schema.parse(out) as T;
    } catch (err) {
      lastError = err;
      log.debug(
        { method, name, err: (err as Error).message },
        "structured method failed, trying next",
      );
    }
  }

  log.warn(
    { name, err: (lastError as Error)?.message },
    "structured output unavailable; falling back to JSON extraction",
  );
  const fallback = getClient(clientOpts);
  const res = await fallback.invoke([
    new SystemMessage(
      `${system}\n\nRespond with ONLY a single valid JSON object matching this JSON Schema. No prose, no markdown.\n\n${schemaHint(schema)}`,
    ),
    new HumanMessage(human),
  ]);
  const raw = extractJson(contentToString(res.content));
  return schema.parse(raw) as T;
}

async function deepseekStructured<T>(args: StructuredArgs<T>): Promise<T> {
  return structuredVia(getChatModel, args);
}

async function openrouterStructured<T>(args: StructuredArgs<T>): Promise<T> {
  return structuredVia(getOpenRouterModel, args);
}

async function antigravityStructured<T>(args: StructuredArgs<T>): Promise<T> {
  const { schema, system, human, model } = args;
  const result = await antigravityRun({
    prompt: human,
    system,
    model,
    jsonSchema: toJsonSchemaSafe(schema),
  });
  const value = result.structured ?? tryExtractJson(result.response);
  if (value === null || value === undefined) {
    throw new Error("antigravity: tidak ada structured output");
  }
  return schema.parse(value) as T;
}

/* ─────────────────────── provider registry & fallback ─────────────── */

interface ProviderImpl {
  structured: <T>(args: StructuredArgs<T>) => Promise<T>;
  text: (args: TextArgs) => Promise<string>;
}

function isLlmProvider(value: string): value is LlmProvider {
  return value === "deepseek" || value === "antigravity" || value === "openrouter";
}

/**
 * Rantai provider: utama → `LLM_FALLBACK_PROVIDERS` (urut) → DeepSeek (bila
 * `LLM_FALLBACK_TO_DEEPSEEK=true`). Provider tanpa kredensial akan gagal dan
 * otomatis dilewati ke lapis berikutnya.
 */
function providerChain(primary: LlmProvider): LlmProvider[] {
  const chain: LlmProvider[] = [primary];
  for (const raw of env.LLM_FALLBACK_PROVIDERS.split(",")) {
    const provider = raw.trim();
    if (provider && isLlmProvider(provider) && !chain.includes(provider)) chain.push(provider);
  }
  if (env.LLM_FALLBACK_TO_DEEPSEEK && !chain.includes("deepseek")) chain.push("deepseek");
  return chain;
}

const PROVIDER_IMPL: Record<LlmProvider, ProviderImpl> = {
  deepseek: { structured: deepseekStructured, text: deepseekText },
  antigravity: { structured: antigravityStructured, text: antigravityText },
  openrouter: { structured: openrouterStructured, text: openrouterText },
};

/**
 * Ask the model for a structured object.
 *
 * Provider dipilih via `args.provider`, override berdasarkan `name`, atau
 * `LLM_PROVIDER`. Bila provider gagal, dicoba berurutan mengikuti
 * `LLM_FALLBACK_PROVIDERS` lalu DeepSeek.
 */
export async function structuredInvoke<T>(args: StructuredArgs<T>): Promise<T> {
  const chain = providerChain(resolveProvider(args.name, args.provider));
  let lastError: unknown;
  for (let i = 0; i < chain.length; i += 1) {
    const provider = chain[i]!;
    try {
      return await PROVIDER_IMPL[provider].structured(args);
    } catch (err) {
      lastError = err;
      if (i < chain.length - 1) {
        log.warn(
          { name: args.name, provider, err: (err as Error).message },
          "provider gagal, coba fallback berikutnya",
        );
      }
    }
  }
  throw lastError;
}

/* ───────────────────────────── text output ─────────────────────────── */

export interface TextArgs {
  system: string;
  human: string;
  temperature?: number;
  model?: string;
  maxTokens?: number;
  reasoning?: boolean;
  name?: string;
  provider?: LlmProvider;
}

async function deepseekText(args: TextArgs): Promise<string> {
  const { system, human, temperature, model, maxTokens, reasoning } = args;
  const llm = getChatModel({ temperature, model, maxTokens, reasoning });
  const res = await llm.invoke([new SystemMessage(system), new HumanMessage(human)]);
  return contentToString(res.content).trim();
}

async function openrouterText(args: TextArgs): Promise<string> {
  const { system, human, temperature, model, maxTokens } = args;
  const llm = getOpenRouterModel({ temperature, model, maxTokens });
  const res = await llm.invoke([new SystemMessage(system), new HumanMessage(human)]);
  return contentToString(res.content).trim();
}

async function antigravityText(args: TextArgs): Promise<string> {
  const result = await antigravityRun({
    prompt: args.human,
    system: args.system,
    model: args.model,
    timeoutMs: env.ANTIGRAVITY_TIMEOUT_MS,
  });
  return result.response.trim();
}

/** Free-form text completion (provider-aware, dengan rantai fallback). */
export async function textInvoke(args: TextArgs): Promise<string> {
  const chain = providerChain(resolveProvider(args.name, args.provider));
  let lastError: unknown;
  for (let i = 0; i < chain.length; i += 1) {
    const provider = chain[i]!;
    try {
      return await PROVIDER_IMPL[provider].text(args);
    } catch (err) {
      lastError = err;
      if (i < chain.length - 1) {
        log.warn(
          { name: args.name, provider, err: (err as Error).message },
          "provider gagal, coba fallback berikutnya",
        );
      }
    }
  }
  throw lastError;
}

export { antigravityAvailable, resetAntigravityAvailability } from "./antigravity.js";
