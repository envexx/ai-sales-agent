import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("calcom");

/**
 * Cal.com scheduling via the official MCP server.
 *
 * Transport choice:
 *  - `CAL_MCP_URL` set  → hosted streamable HTTP MCP (OAuth handled by an
 *    auth provider; intended for interactive clients).
 *  - `CAL_API_KEY` set  → local stdio server `npx @calcom/cal-mcp --all-tools`,
 *    which is what a backend service should use.
 *  - neither            → disabled; the graph falls back to sharing the
 *    booking link.
 *
 * Only booking-relevant tools are exposed to the model. The server ships 149
 * tools with `--all-tools`; binding all of them would bloat every request.
 */
const TOOL_ALLOWLIST = new Set([
  "calcom__getEventTypes",
  "calcom__getAvailableSlots",
  "calcom__createBooking",
  "calcom__getBooking",
  "calcom__getBookings",
  "calcom__rescheduleBooking",
  "calcom__cancelBooking",
  "calcom__getCalendarLinks",
]);

type CalTools = Awaited<ReturnType<MultiServerMCPClient["getTools"]>>;

let adapter: MultiServerMCPClient | null = null;
let toolsCache: CalTools | null = null;
let connecting: Promise<CalTools> | null = null;

export function isCalEnabled(): boolean {
  return Boolean(env.CAL_API_KEY || env.CAL_MCP_URL);
}

export function calTransport(): "http" | "stdio" | "disabled" {
  if (env.CAL_MCP_URL) return "http";
  if (env.CAL_API_KEY) return "stdio";
  return "disabled";
}

function buildAdapter(): MultiServerMCPClient {
  if (env.CAL_MCP_URL) {
    log.info({ url: env.CAL_MCP_URL }, "connecting to hosted Cal.com MCP");
    return new MultiServerMCPClient({
      mcpServers: { calcom: { url: env.CAL_MCP_URL } },
    } as never);
  }

  const args = ["-y", "@calcom/cal-mcp@latest"];
  if (env.CAL_MCP_ALL_TOOLS) args.push("--all-tools");
  log.info("starting Cal.com MCP via stdio (npx @calcom/cal-mcp)");
  return new MultiServerMCPClient({
    mcpServers: {
      calcom: {
        command: "npx",
        args,
        env: { ...process.env, CAL_API_KEY: env.CAL_API_KEY },
      },
    },
  } as never);
}

/** Connect once and return the booking-focused subset of Cal.com tools. */
export async function getCalTools(): Promise<CalTools> {
  if (toolsCache) return toolsCache;
  if (connecting) return connecting;

  connecting = (async () => {
    adapter = adapter ?? buildAdapter();
    const all = await adapter.getTools();
    const filtered = all.filter((t) => TOOL_ALLOWLIST.has(t.name));
    toolsCache = filtered.length > 0 ? filtered : all;
    log.info(
      { available: all.length, exposed: toolsCache.length, tools: toolsCache.map((t) => t.name) },
      "Cal.com MCP tools ready",
    );
    return toolsCache;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export async function closeCal(): Promise<void> {
  await adapter?.close().catch(() => {});
  adapter = null;
  toolsCache = null;
}
