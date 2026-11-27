import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Tests run their own `next dev` in a separate folder so they can't overwrite a running production build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The Android app's camera studio (https://localhost) loads the face tracker from this server.
  async headers() {
    return [
      {
        source: "/mediapipe/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://localhost" },
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
    ];
  },
  experimental: { serverActions: { bodySizeLimit: "100mb" } },
};

export default nextConfig;
