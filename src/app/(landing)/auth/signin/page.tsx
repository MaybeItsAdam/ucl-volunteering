"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { VolSocHand } from "@/components/landing/VolSocHand";

export default function SignInPage() {
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    // Back from UCL sign-in restores this page from the back/forward cache,
    // still saying "Opening…".
    const reset = (event: PageTransitionEvent) => event.persisted && setOpening(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <section className="uvs-signin" aria-labelledby="signin-title">
      <VolSocHand className="uvs-signin-logo" />
      <h1 id="signin-title">Committee sign in</h1>
      <p>The committee&apos;s event plan, availability and members.</p>

      <a
        className="uvs-cta uvs-cta-primary"
        href="/api/auth/start"
        onClick={() => setOpening(true)}
        aria-busy={opening}
      >
        {opening ? "Opening UCL sign-in…" : "Continue with UCL sign-in"}
      </a>

      <p className="uvs-signin-note">
        Your usual UCL login, through Adam&apos;s Campus Toolbox; we never see your password.
        Anyone can sign in, and a principal adds you to the committee.
      </p>

      {process.env.NODE_ENV === "development" && (
        <div className="uvs-signin-dev">
          <span>Local dev sign-in</span>
          {["committee", "principal", "admin", "none"].map((role) => (
            <a key={role} href={`/api/auth/dev-login?role=${role}`}>{role}</a>
          ))}
        </div>
      )}

      <Link className="uvs-signin-back" href="/">Back to the homepage</Link>
    </section>
  );
}
