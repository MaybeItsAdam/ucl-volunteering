import type { Metadata, Viewport } from "next";
import { League_Spartan, Work_Sans } from "next/font/google";
import { NativeAuthBridge } from "@/components/NativeAuthBridge";
import { themeScript } from "@/lib/theme";
import "./globals.css";

// The VolSoc brand faces: League Spartan for headlines and titles, Work Sans
// (medium by default) for everything else. Exposed as CSS variables for the CSS.
const leagueSpartan = League_Spartan({ weight: ["600", "700"], subsets: ["latin"], variable: "--font-league-spartan" });
const workSans = Work_Sans({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-work-sans" });

export const metadata: Metadata = {
  title: { default: "UCL Volunteering Society", template: "%s | VolSoc" },
  description: "UCL Volunteering Society: Volunteering, socials and the committee's plan",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://uclvolunteering.org"),
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
      </body>
    </html>
  );
}
