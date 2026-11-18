import type { NextConfig } from "next";

// Files in public/ keep their names between builds, so they get a fixed lifetime instead of
// Next's default max-age=0, which makes every visit re-check every texture and city grid.
const DAY = 86400;

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/textures/:file*",
        headers: [{ key: "Cache-Control", value: `public, max-age=${30 * DAY}, stale-while-revalidate=${30 * DAY}` }],
      },
      {
        source: "/data/:file*",
        headers: [{ key: "Cache-Control", value: `public, max-age=${DAY}, stale-while-revalidate=${7 * DAY}` }],
      },
    ];
  },
};

export default nextConfig;
