// Launcher untuk PM2: jalankan backend dev (entry .playwright-cli/ui-api.ts)
// via tsx. Dipakai agar PM2 bisa mengawasi & me-restart otomatis.
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const entry = path.join(root, ".playwright-cli", "ui-api.ts");

const child = spawn(process.execPath, [tsx, entry], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on("error", (err) => {
  console.error("[api-dev] gagal menjalankan tsx:", err.message);
  process.exit(1);
});
