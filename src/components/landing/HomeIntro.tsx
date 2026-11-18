import Link from "next/link";
import { SITE_DESCRIPTION } from "@/lib/seo";
import { VolSocHand } from "./VolSocHand";

/**
 * The society's name and the three ways in for everyone: what's on, signing up
 * to volunteer, and logging a Zero Food Waste collection. The committee signs
 * in from the top bar on any other page.
 */
export function HomeIntro() {
  return (
    <>
      <VolSocHand className="uvs-hero-logo" />
      <h1>UCL Volunteering Society</h1>
      {/* The plain answer to "what is this?" for screen readers, search and AI assistants. */}
      <p className="sr-only">{SITE_DESCRIPTION}</p>
      <div className="uvs-cta-row">
        <Link className="uvs-cta uvs-cta-primary" href="/calendar">
          What&apos;s on
        </Link>
        <Link className="uvs-cta uvs-cta-secondary" href="/volunteer">
          Sign up to volunteer
        </Link>
        <Link className="uvs-cta uvs-cta-secondary" href="/zero-food-waste">
          Log a Zero Food Waste collection
        </Link>
      </div>
    </>
  );
}
