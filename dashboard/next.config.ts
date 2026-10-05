import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives beside the backend package, so tell Turbopack which
  // directory is the workspace root (silences the multi-lockfile warning).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
