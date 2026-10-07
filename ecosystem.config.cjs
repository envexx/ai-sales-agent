/**
 * PM2 process definition for the Sales Agent.
 *
 *   pm2 start ecosystem.config.cjs     # start API, dashboard, dan Claw3D
 *   pm2 save                           # remember the list (for resurrect)
 *   pm2 logs                           # tail both logs
 *   pm2 restart all | pm2 stop all
 */
const path = require("path");

module.exports = {
  apps: [
    {
      name: "nadia-api",
      cwd: __dirname,
      script: "dist/index.js",
      node_args: "--enable-source-maps",
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 100,
      restart_delay: 10000, // waits for Docker/Postgres to come up after a reboot
      kill_timeout: 8000,
      merge_logs: true,
      time: true,
      out_file: "./logs/api-out.log",
      error_file: "./logs/api-err.log",
      env: { NODE_ENV: "production" },
    },
    {
      name: "nadia-dashboard",
      cwd: path.join(__dirname, "dashboard"),
      script: "./node_modules/next/dist/bin/next",
      args: "start -p 3001",
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 100,
      restart_delay: 5000,
      kill_timeout: 8000,
      merge_logs: true,
      time: true,
      out_file: "../logs/dashboard-out.log",
      error_file: "../logs/dashboard-err.log",
    },
    {
      name: "claw3d-business-gateway",
      cwd: path.join(__dirname, "claw3d"),
      script: "server/business-gateway-adapter.js",
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      merge_logs: true,
      time: true,
      out_file: "../logs/claw3d-gateway-out.log",
      error_file: "../logs/claw3d-gateway-err.log",
      env: { NODE_ENV: "production", BUSINESS_ADAPTER_PORT: 18789, BUSINESS_API_URL: "http://127.0.0.1:4000" },
    },
    {
      name: "claw3d-studio",
      cwd: path.join(__dirname, "claw3d"),
      script: "server/index.js",
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      kill_timeout: 8000,
      merge_logs: true,
      time: true,
      out_file: "../logs/claw3d-out.log",
      error_file: "../logs/claw3d-err.log",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3000,
        CLAW3D_GATEWAY_URL: "ws://127.0.0.1:18789",
        CLAW3D_GATEWAY_ADAPTER_TYPE: "demo",
        UPSTREAM_ALLOWLIST: "127.0.0.1,localhost",
      },
    },
  ],
};
