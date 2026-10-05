import type { Metadata } from "next";
import Link from "next/link";
import { VolSocHand } from "@/components/landing/VolSocHand";

export const metadata: Metadata = {
  title: { absolute: "UCL Volunteering Society" },
};

/** Public front page: the flag. The committee's way in is its sign-in link. */
export default function HomePage() {
  return (
    <>
      <VolSocHand className="uvs-hero-logo" />
      <h1>UCL Volunteering Society</h1>
      <div className="uvs-cta-row">
        <Link className="uvs-cta uvs-cta-primary" href="/portal">
          Committee sign in
        </Link>
      </div>
    </>
  );
}
