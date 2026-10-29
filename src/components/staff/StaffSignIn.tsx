"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * The access code from the committee, typed or arriving in the link
 * (/staff#XXXXX-XXXXX, which the browser never sends to the server). A link
 * signs in on its own, so for most staff this page is one tap.
 */
export function StaffSignIn() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: value }),
    }).catch(() => null);
    if (res?.ok) return router.refresh();
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setError(body?.error || "Couldn't sign you in, try again");
    setBusy(false);
  }

  useEffect(() => {
    const fromLink = decodeURIComponent(window.location.hash.slice(1));
    if (!fromLink || tried.current) return;
    tried.current = true;
    history.replaceState(null, "", window.location.pathname);
    setCode(fromLink);
    void submit(fromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival with a code in the link
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(code);
  }

  return (
    <form className="panel col-form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="staff-code">Access code</label>
        <input
          id="staff-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXXX-XXXXX"
          className="mono"
        />
        <span className="hint">From the VolSoc committee. Sent to you as a link? Opening it signs you in</span>
        {error && <span className="error">{error}</span>}
      </div>
      <button type="submit" className="button primary" disabled={busy || !code.trim()}>
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
