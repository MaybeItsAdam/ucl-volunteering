"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";

/**
 * Store reviewers have no UCL login. Seven taps on the wrapped sentence reveal
 * an email and password form for the Toolbox reviewer accounts: the same
 * gesture the Toolbox, Side Quests and the hiking app use, so one set of review
 * notes covers them all. Everyone else never sees it.
 */
export function ReviewerTap({ children, next }: { children: ReactNode; next: string }) {
  const taps = useRef(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) {
      setError(body?.error ?? "Sign-in failed, try again");
      setBusy(false);
      return;
    }
    window.location.assign(next);
  }

  return (
    <>
      <p onClick={() => (taps.current += 1) >= 7 && setOpen(true)}>{children}</p>
      {open && (
        <form onSubmit={submit} aria-label="Reviewer sign-in">
          <div className="field">
            <label htmlFor="review-email">Reviewer email</label>
            <input id="review-email" name="email" type="email" autoComplete="username" autoCapitalize="none" required />
          </div>
          <div className="field">
            <label htmlFor="review-password">Password</label>
            <input id="review-password" name="password" type="password" autoComplete="current-password" required />
            {error && <span className="error" role="alert">{error}</span>}
          </div>
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Reviewer sign-in"}
          </button>
        </form>
      )}
    </>
  );
}
