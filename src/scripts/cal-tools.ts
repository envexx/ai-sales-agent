import { closeCal, calTransport, getCalTools, isCalEnabled } from "../integrations/calcom.js";
import { logger } from "../config/logger.js";

/**
 * Lists the Cal.com MCP tools exposed to the scheduling node.
 * Run with `npm run cal:tools` after setting CAL_API_KEY.
 */
async function main(): Promise<void> {
  const transport = calTransport();
  logger.info({ transport }, "Cal.com MCP transport");

  if (!isCalEnabled()) {
    logger.warn(
      "Cal.com MCP disabled. Set CAL_API_KEY (or CAL_MCP_URL) in .env to enable scheduling.",
    );
    return;
  }

  const tools = await getCalTools();
  // eslint-disable-next-line no-console
  console.log(`\n${tools.length} tool tersedia:\n`);
  for (const t of tools) {
    console.log(`- ${t.name}`);
    console.log(`    ${String(t.description ?? "").replace(/\s+/g, " ").slice(0, 160)}`);
  }
}

main()
  .catch((err) => {
    logger.error({ err: (err as Error).stack ?? String(err) }, "cal:tools failed");
    process.exitCode = 1;
  })
  .finally(() => void closeCal());
