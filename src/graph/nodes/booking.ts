import { z } from "zod";
import { structuredInvoke } from "../../llm/index.js";
import { bookingPrompt, businessContext } from "../prompts.js";
import { saveBooking } from "../../repository/index.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import type { BookingInfo } from "../../types.js";
import { traceEntry, transcript } from "./helpers.js";

const BookingSchema = z.object({
  intent: z.boolean(),
  status: z.enum(["none", "proposed", "confirmed"]),
  scheduledAt: z.string().nullable(),
  followUpAt: z.string().nullable(),
  details: z.record(z.string(), z.any()),
});

/** Detect booking intent and schedule a follow-up. */
export async function bookingNode(state: SalesStateType): Promise<SalesUpdateType> {
  // A booking created through Cal.com is authoritative — record it directly.
  if (state.calBooking?.action === "booked") {
    const booking: BookingInfo = {
      intent: true,
      status: "confirmed",
      scheduledAt: state.calBooking.start,
      followUpAt: null,
      details: {
        sumber: "cal.com",
        uid: state.calBooking.uid,
        meetingUrl: state.calBooking.meetingUrl,
        status: state.calBooking.status,
      },
    };
    try {
      await saveBooking({ leadId: state.leadId, threadId: state.threadId, booking });
    } catch {
      /* best-effort */
    }
    return {
      booking,
      trace: [
        traceEntry("bookingFlow", { source: "cal.com", status: "confirmed", uid: state.calBooking.uid }),
      ],
    };
  }

  const human = [
    `Konteks bisnis:\n${businessContext}`,
    `Transkrip:\n${transcript(state.messages, 10)}`,
    `Balasan agen terakhir:\n"""${state.finalResponse}"""`,
    `Pesan terakhir prospek:\n"""${state.inboundMessage}"""`,
  ].join("\n\n");

  let booking: BookingInfo;
  try {
    const res = await structuredInvoke({
      schema: BookingSchema,
      system: bookingPrompt.system,
      human,
      name: "Booking",
      temperature: 0,
    });
    booking = {
      intent: res.intent,
      status: res.status,
      scheduledAt: res.scheduledAt,
      followUpAt: res.followUpAt,
      details: res.details as Record<string, unknown>,
    };
  } catch (err) {
    booking = {
      intent: false,
      status: "none",
      scheduledAt: null,
      followUpAt: null,
      details: { error: (err as Error).message },
    };
    return {
      booking,
      errors: [`booking: ${(err as Error).message}`],
      trace: [traceEntry("booking", { fallback: true })],
    };
  }

  if (booking.intent || booking.status !== "none") {
    try {
      await saveBooking({ leadId: state.leadId, threadId: state.threadId, booking });
    } catch {
      /* scheduling persistence is best-effort */
    }
  }

  return {
    booking,
    trace: [
      traceEntry("booking", {
        intent: booking.intent,
        status: booking.status,
        followUpAt: booking.followUpAt,
      }),
    ],
  };
}
