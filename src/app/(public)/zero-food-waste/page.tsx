import type { Metadata } from "next";
import { ZeroFoodWasteForm } from "@/components/public/ZeroFoodWasteForm";
import { londonDayKey } from "@/lib/planTime";
import { ZFW_SHEET_URL } from "@/lib/zeroFoodWaste";

export const metadata: Metadata = {
  title: "Zero Food Waste log",
  description: "Log what you collected on a Zero Food Waste shift",
  robots: { index: false },
};

// Today's date is the form's default, so the page can't be built once and kept.
export const dynamic = "force-dynamic";

export default function ZeroFoodWastePage() {
  return (
    <section className="page narrow">
      <header className="page-head zfw-head">
        <span className="micro-label">Zero Food Waste</span>
        <h1>Log a collection</h1>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed asset, no resizing needed */}
        <img className="zfw-logo" src="/zfw.png" alt="Zero Food Waste UCL" width={307} height={360} />
      </header>
      <p className="muted pub-lede">
        One entry per outlet, straight after your shift. It goes into the team&apos;s{" "}
        <a href={ZFW_SHEET_URL} target="_blank" rel="noreferrer">
          tracking sheet
        </a>
      </p>
      <ZeroFoodWasteForm today={londonDayKey(new Date())} />
    </section>
  );
}
