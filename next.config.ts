import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Tests run their own `next dev` in a separate folder so they can't overwrite a running production build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { serverActions: { bodySizeLimit: "100mb" } },
};

export default nextConfig;
