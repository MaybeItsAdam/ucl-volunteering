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
  // The plan became the calendar, and availability moved into it. Old links
  // and bookmarks still land; query strings (?week=, ?day=) pass through.
  async redirects() {
    return [
      { source: "/portal/plan", destination: "/portal/calendar", permanent: false },
      { source: "/portal/plan/:path*", destination: "/portal/calendar/:path*", permanent: false },
      { source: "/portal/availability", destination: "/portal/calendar?availability=edit", permanent: false },
    ];
  },
};

export default nextConfig;
