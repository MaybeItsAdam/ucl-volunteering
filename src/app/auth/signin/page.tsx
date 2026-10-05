"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, HandHeart, LogIn, ShieldCheck, Users } from "lucide-react";

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
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-intro">
          <span className="auth-mark"><HandHeart size={26} aria-hidden="true" /></span>
          <span className="micro-label">UCL Volunteering Society × Adam&apos;s Campus Toolbox</span>
          <h1>Committee sign-in</h1>
          <p>The VolSoc committee&apos;s event plan, availability and members.</p>

          <ul className="auth-info">
            <li>
              <ShieldCheck size={18} aria-hidden="true" />
              <div>
                <strong>UCL single sign-on</strong>
                <small>Your usual UCL login, through Adam&apos;s Campus Toolbox. VolSoc never sees your password.</small>
              </div>
            </li>
            <li>
              <Users size={18} aria-hidden="true" />
              <div>
                <strong>Committee only</strong>
                <small>Anyone can sign in; a principal adds you to the committee to see the plan.</small>
              </div>
            </li>
          </ul>
        </div>

        <div className="auth-actions">
          <a
            className="button primary full-width"
            href="/api/auth/start"
            onClick={() => setOpening(true)}
            aria-busy={opening}
          >
            <LogIn size={18} aria-hidden="true" />
            <span>{opening ? "Opening UCL sign-in…" : "Continue with UCL sign-in"}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </a>

          {process.env.NODE_ENV === "development" && (
            <div className="auth-dev">
              <span className="micro-label">Local dev sign-in</span>
              <div>
                {["committee", "principal", "admin", "none"].map((role) => (
                  <a key={role} className="button small" href={`/api/auth/dev-login?role=${role}`}>{role}</a>
                ))}
              </div>
            </div>
          )}

          <Link className="auth-home" href="/">Back to the homepage</Link>
        </div>
      </section>
    </main>
  );
}
