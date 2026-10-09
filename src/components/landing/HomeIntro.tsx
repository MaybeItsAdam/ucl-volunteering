"use client";

import { useState } from "react";
import Link from "next/link";
import { SignInPanel } from "./SignInPanel";
import { VolSocHand } from "./VolSocHand";

/**
 * The society's name and the three ways in for everyone: what's on, signing up
 * to volunteer, and logging a Zero Food Waste collection. The committee's way
 * in sits quietly underneath; signed out, it opens the sign-in box right here
 * rather than sending you to a page that looks the same, and signed in on the
 * committee it goes straight to the dashboard.
 */
export function HomeIntro({ signedIn, committee }: { signedIn: boolean; committee: boolean }) {
  const [signingIn, setSigningIn] = useState(false);

  if (signingIn) return <SignInPanel onBack={() => setSigningIn(false)} />;

  return (
    <>
      <VolSocHand className="uvs-hero-logo" />
      <h1>UCL Volunteering Society</h1>
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
      {committee ? (
        <Link className="uvs-committee-link" href="/portal">
          Committee dashboard
        </Link>
      ) : (
        !signedIn && (
          <button type="button" className="uvs-committee-link" onClick={() => setSigningIn(true)}>
            Committee sign in
          </button>
        )
      )}
    </>
  );
}
