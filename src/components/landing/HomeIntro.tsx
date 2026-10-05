"use client";

import { useState } from "react";
import Link from "next/link";
import { SignInPanel } from "./SignInPanel";
import { VolSocHand } from "./VolSocHand";

/**
 * The society's name and the committee's way in. Signed out, the button opens
 * the sign-in box right here rather than sending you to a page that looks the
 * same; signed in, it goes straight to the portal.
 */
export function HomeIntro({ signedIn }: { signedIn: boolean }) {
  const [signingIn, setSigningIn] = useState(false);

  if (signingIn) return <SignInPanel onBack={() => setSigningIn(false)} />;

  return (
    <>
      <VolSocHand className="uvs-hero-logo" />
      <h1>UCL Volunteering Society</h1>
      <div className="uvs-cta-row">
        {signedIn ? (
          <Link className="uvs-cta uvs-cta-primary" href="/portal">
            Committee portal
          </Link>
        ) : (
          <button type="button" className="uvs-cta uvs-cta-primary" onClick={() => setSigningIn(true)}>
            Committee sign in
          </button>
        )}
      </div>
    </>
  );
}
