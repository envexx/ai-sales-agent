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

const log = loggerFor("llm");

export interface ModelOptions {
  temperature?: number;
  model?: string;
  maxTokens?: number;
  /** Route to the reasoning model (deepseek-reasoner) when enabled in env. */
  reasoning?: boolean;
}

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

export interface StructuredArgs<T> {
  schema: z.ZodType<T>;
  system: string;
  human: string;
  name?: string;
  temperature?: number;
  model?: string;
  reasoning?: boolean;
}

function schemaHint(schema: z.ZodType<unknown>): string {
  try {
    const zz = z as unknown as { toJSONSchema?: (s: z.ZodType<unknown>) => unknown };
    if (typeof zz.toJSONSchema === "function") {
      return JSON.stringify(zz.toJSONSchema(schema), null, 2);
    }
  } catch {
    /* ignore */
  }
  return "{}";
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

/**
 * Structured-output methods, tried in order.
 *
 * LangChain's default is `jsonSchema` (OpenAI `response_format: json_schema`),
 * which DeepSeek rejects with "response_format type is unavailable". DeepSeek
 * supports function calling and `json_object`, so we try those first and only
 * then fall back to plain completion + JSON extraction.
 */
const STRUCTURED_METHODS: Array<
  NonNullable<StructuredOutputMethodOptions<false>["method"]>
> = ["functionCalling", "jsonMode"];

/**
 * Ask the model for a structured object.
 *
 * The cascade keeps the pipeline working across providers: DeepSeek, OpenAI,
 * or any OpenAI-compatible endpoint, with or without tool calling.
 */
export async function structuredInvoke<T>(args: StructuredArgs<T>): Promise<T> {
  const { schema, system, human, name = "Output", temperature, model, reasoning } = args;
  const llm = getChatModel({ temperature, model, reasoning });
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
  const fallback = getChatModel({ temperature, model, reasoning });
  const res = await fallback.invoke([
    new SystemMessage(
      `${system}\n\nRespond with ONLY a single valid JSON object matching this JSON Schema. No prose, no markdown.\n\n${schemaHint(schema)}`,
    ),
    new HumanMessage(human),
  ]);
  const raw = extractJson(contentToString(res.content));
  return schema.parse(raw) as T;
}

export interface TextArgs {
  system: string;
  human: string;
  temperature?: number;
  model?: string;
  maxTokens?: number;
  reasoning?: boolean;
}

/** Free-form text completion. */
export async function textInvoke(args: TextArgs): Promise<string> {
  const { system, human, temperature, model, maxTokens, reasoning } = args;
  const llm = getChatModel({ temperature, model, maxTokens, reasoning });
  const res = await llm.invoke([new SystemMessage(system), new HumanMessage(human)]);
  return contentToString(res.content).trim();
}
