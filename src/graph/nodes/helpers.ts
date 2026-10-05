import type { BaseMessage } from "@langchain/core/messages";
import { contentToString } from "../../llm/index.js";
import type { RetrievedDoc, TraceEntry } from "../../types.js";

export function traceEntry(
  node: string,
  detail?: Record<string, unknown>,
): TraceEntry {
  return { node, at: new Date().toISOString(), detail };
}

/** Build a compact, grounded context block from retrieved documents. */
export function formatContext(docs: RetrievedDoc[], max = 6): string {
  if (docs.length === 0) return "(no relevant context found)";
  return docs
    .slice(0, max)
    .map((d, i) => {
      const tag = d.source === "knowledge" ? "KNOWLEDGE" : "MEMORY";
      return `[${i + 1}] (${tag} · ${d.title} · score ${d.score.toFixed(2)})\n${d.content}`;
    })
    .join("\n\n");
}

/** Turn the rolling message list into a readable transcript. */
export function transcript(messages: BaseMessage[], max = 12): string {
  if (!messages.length) return "(no prior messages)";
  return messages
    .slice(-max)
    .map((m) => {
      const role =
        m._getType() === "human" ? "Lead" : m._getType() === "ai" ? "Agent" : "System";
      return `${role}: ${contentToString(m.content as never)}`;
    })
    .join("\n");
}
