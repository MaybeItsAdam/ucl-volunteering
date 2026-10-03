import type { Metadata, Viewport } from "next";
import { Arvo, Geist_Mono } from "next/font/google";
import { themeScript } from "@/lib/theme";
import "./globals.css";

// The slab serif is the brand and the body face; the mono is for times, tickers
// and control-bar labels. Exposed as CSS variables for globals.css.
const arvo = Arvo({ weight: ["400", "700"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-arvo" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: { default: "UCL Volunteering Society", template: "%s | VolSoc" },
  description: "UCL Volunteering Society: volunteering, socials and the committee's plan.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://ucl-volunteering.vercel.app"),
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
    <html lang="en-GB" className={`${arvo.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
