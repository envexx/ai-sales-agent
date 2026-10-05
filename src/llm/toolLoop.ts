import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { getChatModel, contentToString, type ModelOptions } from "./index.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("llm:tools");

export interface ToolCallLog {
  name: string;
  args: unknown;
  result: string;
}

export interface ToolLoopResult {
  text: string;
  calls: ToolCallLog[];
}

const stringify = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * Minimal ReAct-style loop: the model may call tools until it produces a final
 * text answer (or the iteration budget runs out). Used for Cal.com scheduling,
 * where the set of required calls depends on the lead's intent.
 */
export async function runToolLoop(args: {
  system: string;
  human: string;
  tools: StructuredToolInterface[];
  maxIterations?: number;
  temperature?: number;
  model?: ModelOptions["model"];
}): Promise<ToolLoopResult> {
  const base = getChatModel({ temperature: args.temperature ?? 0, model: args.model });
  const llm = base.bindTools(args.tools);
  const messages: BaseMessage[] = [
    new SystemMessage(args.system),
    new HumanMessage(args.human),
  ];
  const calls: ToolCallLog[] = [];
  const byName = new Map(args.tools.map((t) => [t.name, t]));
  const max = args.maxIterations ?? 6;

  for (let i = 0; i < max; i++) {
    const res = await llm.invoke(messages);
    messages.push(res);

    const toolCalls = res.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { text: contentToString(res.content), calls };
    }

    for (const call of toolCalls) {
      const tool = byName.get(call.name);
      let output: string;
      try {
        if (!tool) throw new Error(`unknown tool ${call.name}`);
        output = stringify(await tool.invoke(call.args as never));
      } catch (err) {
        output = `ERROR: ${(err as Error).message}`;
      }
      calls.push({ name: call.name, args: call.args, result: output.slice(0, 800) });
      messages.push(
        new ToolMessage({ content: output, tool_call_id: call.id ?? call.name }),
      );
    }
  }

  log.warn({ calls: calls.length }, "tool loop hit iteration limit");
  const last = messages.at(-1);
  return { text: last ? contentToString(last.content as never) : "", calls };
}
