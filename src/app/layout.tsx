import type { Metadata, Viewport } from "next";
import { League_Spartan, Work_Sans } from "next/font/google";
import { NativeAuthBridge } from "@/components/NativeAuthBridge";
import { NativePushBridge } from "@/components/NativePushBridge";
import { NativeSystemBars } from "@/components/NativeSystemBars";
import { OfflineBanner } from "@/components/OfflineBanner";
import { IS_PREVIEW, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import { themeScript } from "@/lib/theme";
import "./globals.css";

// The VolSoc brand faces: League Spartan for headlines and titles, Work Sans
// (medium by default) for everything else. Exposed as CSS variables for the CSS.
const leagueSpartan = League_Spartan({ weight: ["600", "700"], subsets: ["latin"], variable: "--font-league-spartan" });
const workSans = Work_Sans({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-work-sans" });

const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;
const bingVerification = process.env.BING_SITE_VERIFICATION;

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: "%s | UCL Volunteering Society" },
  description: SITE_DESCRIPTION,
  // The canonical origin (src/lib/seo.ts), not NEXT_PUBLIC_APP_URL, so canonicals
  // and share cards never point at a vercel.app host.
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, locale: "en_GB", type: "website" },
  twitter: { card: "summary_large_image" },
  // Previews never get indexed; other hosts are kept out by robots.ts and the
  // X-Robots-Tag header in next.config.ts.
  ...(IS_PREVIEW ? { robots: { index: false, follow: false } } : {}),
  // Optional HTML-tag verification for Search Console / Bing Webmaster (DNS works too).
  verification: {
    ...(googleVerification ? { google: googleVerification } : {}),
    ...(bingVerification ? { other: { "msvalidate.01": bingVerification } } : {}),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets pages reach under the notch and home indicator, and makes
  // env(safe-area-inset-*) report real values so they can pad around them.
  viewportFit: "cover",
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" data-theme="light" className={`${leagueSpartan.variable} ${workSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <NativeAuthBridge />
        <NativePushBridge />
        <NativeSystemBars />
        <OfflineBanner />
      </body>
    </html>
  );
}
