"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { VolSocHand } from "@/components/landing/VolSocHand";

/**
 * The Toolbox sends people back here with `#token=` in the fragment, which never
 * reaches a server log. Swap it for a session and move on to the portal.
 */
export default function AuthCallback() {
  const [message, setMessage] = useState("Checking your UCL account…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    async function completeSignIn() {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
      history.replaceState(null, "", window.location.pathname);
      if (!token) throw new Error("The sign-in response did not include a token. Please try again.");

      const response = await fetch("/api/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      // A server crash returns an HTML error page; read the body defensively so
      // the person sees something real rather than a JSON parse error.
      const body = (await response.json().catch(() => null)) as { error?: string; redirectTo?: string } | null;
      if (!response.ok || !body) {
        throw new Error(body?.error || `Sign-in hit a problem on our side (error ${response.status}). Try again in a few minutes.`);
      }
      window.location.replace(body.redirectTo || "/portal");
    }
    void completeSignIn().catch((error: Error) => {
      setMessage(error.message);
      setFailed(true);
    });
  }, []);

  return (
    <section className="uvs-signin" aria-labelledby="signin-title">
      <VolSocHand className="uvs-signin-logo" />
      <h1 id="signin-title">{failed ? "Not quite there" : "Signing you in"}</h1>
      <p role={failed ? "alert" : "status"}>{message}</p>
      {failed ? (
        <Link className="uvs-cta uvs-cta-primary" href="/auth/signin">Try UCL sign-in again</Link>
      ) : (
        <span className="uvs-signin-dots" aria-hidden="true"><i /><i /><i /></span>
      )}
      <Link className="uvs-signin-back" href="/">Back to the homepage</Link>
    </section>
  );
}
