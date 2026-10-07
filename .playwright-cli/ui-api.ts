import { createServer } from '../src/api/server.js';
import { startRuntime } from '../src/runtime.js';
import { closePool } from '../src/db/pool.js';

// Dev/server entry untuk UI: sama seperti `src/index.ts`, tetapi port tetap 4000.
const app = createServer();
const server = app.listen(4000, () => console.log('UI API ready on 4000'));

// Boot runtime lengkap (WhatsApp transport, outreach + pipeline scheduler,
// bot Telegram) agar job agent (mis. scout.audit) benar-benar diproses.
await startRuntime();

const shutdown = async () => {
  await server.close();
  await closePool().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
