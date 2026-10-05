import { loggerFor } from "../../config/logger.js";
import type { SalesStateType, SalesUpdateType } from "../state.js";
import { traceEntry } from "./helpers.js";

const log = loggerFor("node:filter");

/**
 * Terminal branch for messages classified as BOT / automated. The message is
 * logged and dropped; no LLM work and no reply is produced.
 */
export async function filterNode(state: SalesStateType): Promise<SalesUpdateType> {
  log.info(
    { waJid: state.waJid, reason: state.triage?.botReason },
    "bot message filtered out",
  );
  return {
    filtered: true,
    trace: [
      traceEntry("filter", {
        reason: state.triage?.botReason ?? "unknown",
        dropped: true,
      }),
    ],
  };
}
