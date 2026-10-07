// Launcher PM2 untuk OpenCode server khusus agent Developer.
// Server ini dipakai lewat HTTP API (bukan spawn `opencode run` per tugas).
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const PORT = process.env.OPENCODE_SERVER_PORT || "4096";

function resolveOpencode() {
  const appData = process.env.APPDATA || "";
  const candidates = [
    path.join(appData, "npm", "node_modules", "@opencode", "cli", "bin", "opencode.exe"),
  ];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  return "opencode";
}

const bin = resolveOpencode();
const child = spawn(bin, ["serve", "--hostname", "127.0.0.1", "--port", String(PORT)], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    OPENCODE_PASSWORD: process.env.OPENCODE_PASSWORD || "devpass-local",
  },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on("error", (err) => {
  console.error("[opencode-server] gagal menjalankan:", err.message);
  process.exit(1);
});
