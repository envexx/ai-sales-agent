// Launcher PM2 untuk dashboard Next.js (dev server, port 3001).
// Dipakai agar dashboard tetap hidup walau terminal ditutup.
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dir = path.join(root, "dashboard");
const next = path.join(dir, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [next, "dev", "-p", "3001"], {
  cwd: dir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on("error", (err) => {
  console.error("[dashboard-dev] gagal menjalankan next dev:", err.message);
  process.exit(1);
});
