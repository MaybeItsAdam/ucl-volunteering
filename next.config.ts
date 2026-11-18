import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Keep a tab the committee has just looked at for 30s, so flicking back to
    // it is instant instead of another round trip.
    staleTimes: { dynamic: 30 },
    // A tap on a link with no signal waits and retries when the connection is
    // back, instead of a full reload that fails into the browser's own
    // ERR_INTERNET_DISCONNECTED page. OfflineBanner says why it's waiting.
    useOffline: true,
  },
  async headers() {
    // Only the canonical host (src/lib/seo.ts) is indexed: previews and the
    // *.vercel.app host say noindex on every response.
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      process.env.VERCEL_ENV === "preview"
        ? { source: "/:path*", headers: noindex }
        : { source: "/:path*", has: [{ type: "host", value: ".*\\.vercel\\.app" }], headers: noindex },
    ];
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
