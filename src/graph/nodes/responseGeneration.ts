import { AIMessage } from "@langchain/core/messages";
import { textInvoke } from "../../llm/index.js";
import { businessContext, responsePrompt } from "../prompts.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import { formatContext, traceEntry, transcript } from "./helpers.js";

/** Generate the WhatsApp reply that follows the chosen strategy. */
export async function responseGenerationNode(
  state: SalesStateType,
): Promise<SalesUpdateType> {
  const context = formatContext(state.retrievedContext, 5);
  const strategy = state.strategy;

  const scheduling = [
    state.availableSlots.length
      ? `Slot tersedia dari Cal.com (tawarkan 2–3 ini, jangan mengarang):\n${state.availableSlots
          .slice(0, 5)
          .map((s) => `- ${s}`)
          .join("\n")}`
      : "",
    state.calBooking?.action === "booked"
      ? `Booking SUDAH dibuat: ${state.calBooking.start ?? ""} (status ${state.calBooking.status ?? "confirmed"}). Sertakan link meeting: ${state.calBooking.meetingUrl ?? "-"}`
      : "",
    state.calBooking?.missing?.length
      ? `Data yang masih kurang untuk booking: ${state.calBooking.missing.join(", ")} — minta dengan sopan.`
      : "",
    state.schedulingNote ? `Catatan penjadwalan: ${state.schedulingNote}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const human = [
    `Konteks bisnis:\n${businessContext}`,
    `Konteks pendukung (RAG):\n${context}`,
    `Transkrip:\n${transcript(state.messages, 10)}`,
    `Pesan terakhir prospek:\n"""${state.inboundMessage}"""`,
    strategy
      ? `Strategi:\n${JSON.stringify(strategy, null, 2)}`
      : "Strategi: (tidak tersedia, gunakan penilaian terbaik)",
    scheduling ? `Informasi penjadwalan:\n${scheduling}` : "",
    "Tulis satu balasan WhatsApp yang siap kirim:",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const message = await textInvoke({
      system: responsePrompt.system,
      human,
      temperature: 0.6,
      maxTokens: 500,
    });
    const finalResponse = message.trim();
    return {
      draftResponse: finalResponse,
      finalResponse,
      messages: [new AIMessage(finalResponse)],
      trace: [traceEntry("responseGeneration", { length: finalResponse.length })],
    };
  } catch (err) {
    const fallback = "Terima kasih atas pesannya 🙏 Boleh saya bantu jelaskan lebih lanjut?";
    return {
      draftResponse: fallback,
      finalResponse: fallback,
      messages: [new AIMessage(fallback)],
      errors: [`responseGeneration: ${(err as Error).message}`],
      trace: [traceEntry("responseGeneration", { fallback: true })],
    };
  }
}
