import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Keep a tab the committee has just looked at for 30s, so flicking back to
    // it is instant instead of another round trip.
    staleTimes: { dynamic: 30 },
  },
  outputFileTracingExcludes: {
    "*": ["legacy/**", "apps-script/**", "maps/**"],
  },
};

export default nextConfig;
