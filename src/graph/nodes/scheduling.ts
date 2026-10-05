import { z } from "zod";
import { env } from "../../config/env.js";
import { loggerFor } from "../../config/logger.js";
import { getCalTools, isCalEnabled } from "../../integrations/calcom.js";
import { tryExtractJson } from "../../llm/index.js";
import { runToolLoop } from "../../llm/toolLoop.js";
import { schedulingPrompt } from "../prompts.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import { transcript, traceEntry } from "./helpers.js";

const log = loggerFor("node:scheduling");

const SchedulingSchema = z.object({
  action: z.enum(["booked", "slots", "need_info", "none"]),
  availableSlots: z.array(z.string()).default([]),
  booking: z
    .object({
      uid: z.string().nullish(),
      start: z.string().nullish(),
      meetingUrl: z.string().nullish(),
      status: z.string().nullish(),
    })
    .nullish(),
  missing: z.array(z.string()).default([]),
  note: z.string().default(""),
});

/**
 * Cal.com scheduling step (MCP).
 *
 * Sits between the strategy branch and response generation so the reply can
 * offer real availability or confirm a booking that was just created. When
 * Cal.com is not configured it is a no-op and the reply falls back to sharing
 * the booking link.
 */
export async function schedulingNode(
  state: SalesStateType,
): Promise<SalesUpdateType> {
  if (!isCalEnabled()) {
    return { trace: [traceEntry("scheduling", { disabled: true })] };
  }

  const relevant = state.segment === "closing" || state.triage?.intent === "booking";
  if (!relevant) {
    return { trace: [traceEntry("scheduling", { skipped: "bukan konteks booking" })] };
  }

  try {
    const tools = await getCalTools();
    const nowLabel = new Date().toLocaleString("id-ID", { timeZone: env.CAL_TIMEZONE });
    const human = [
      `Waktu sekarang (${env.CAL_TIMEZONE}): ${nowLabel}`,
      `Rentang slot yang dicari: ${env.CAL_SLOT_DAYS} hari ke depan.`,
      env.CAL_EVENT_TYPE_ID
        ? `eventTypeId default: ${env.CAL_EVENT_TYPE_ID}`
        : "eventTypeId belum ditentukan — ambil dari getEventTypes bila perlu.",
      `Nama prospek: ${state.contactName ?? "(belum diketahui)"}`,
      `Transkrip:\n${transcript(state.messages, 12)}`,
      `Pesan terakhir prospek:\n"""${state.inboundMessage}"""`,
      "Selesaikan tugas penjadwalan, lalu balas dengan JSON akhir.",
    ].join("\n\n");

    const { text, calls } = await runToolLoop({
      system: schedulingPrompt.system,
      human,
      tools,
      maxIterations: 6,
      temperature: 0,
    });

    const raw = tryExtractJson(text);
    const parsed = raw ? SchedulingSchema.safeParse(raw) : null;

    if (!parsed?.success) {
      log.warn({ calls: calls.map((c) => c.name) }, "scheduling JSON not parsed");
      return {
        schedulingNote: text.slice(0, 500),
        trace: [
          traceEntry("scheduling", {
            parsed: false,
            calls: calls.map((c) => c.name),
          }),
        ],
      };
    }

    const data = parsed.data;
    return {
      availableSlots: data.availableSlots,
      calBooking: {
        action: data.action,
        uid: data.booking?.uid ?? null,
        start: data.booking?.start ?? null,
        meetingUrl: data.booking?.meetingUrl ?? null,
        status: data.booking?.status ?? null,
        missing: data.missing,
        note: data.note,
      },
      schedulingNote: data.note,
      trace: [
        traceEntry("scheduling", {
          action: data.action,
          slots: data.availableSlots.length,
          calls: calls.map((c) => c.name),
        }),
      ],
    };
  } catch (err) {
    log.error({ err: (err as Error).message }, "scheduling failed");
    return {
      errors: [`scheduling: ${(err as Error).message}`],
      trace: [traceEntry("scheduling", { error: (err as Error).message })],
    };
  }
}
