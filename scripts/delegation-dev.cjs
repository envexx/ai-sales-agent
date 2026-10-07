// Launcher PM2 untuk office "the-delegation" (Vite dev server, port 3005).
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dir = path.join(root, "the-delegation");
const vite = path.join(dir, "node_modules", "vite", "bin", "vite.js");

const child = spawn(process.execPath, [vite, "--port=3005", "--strictPort", "--host=127.0.0.1"], {
  cwd: dir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on("error", (err) => {
  console.error("[delegation-dev] gagal menjalankan vite:", err.message);
  process.exit(1);
});
