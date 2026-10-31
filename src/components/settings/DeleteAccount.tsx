"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

/**
 * The last thing on Settings. Two steps: the first press says exactly what
 * goes, the second does it. Off the committee only — the page explains why
 * otherwise rather than rendering this.
 */
export function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      // A full load on purpose: the session is gone, so nothing cached client-side should survive.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
      return;
    }
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setError(body?.error || "Your account couldn't be deleted, try again in a minute");
    setBusy(false);
  }

  if (!confirming) {
    return (
      <button type="button" className="button danger" onClick={() => setConfirming(true)}>
        <Trash2 size={16} aria-hidden="true" /> Delete my account
      </button>
    );
  }

  return (
    <div className="notice bad settings-confirm" role="alertdialog" aria-labelledby="delete-confirm-title">
      <strong id="delete-confirm-title">Delete your account and everything in it?</strong>
      <p>
        Your volunteer sign-up, linked calendars, availability and phones are removed for good, and you&apos;re signed
        out. Signing in again later starts a fresh, empty account
      </p>
      {error && <p className="settings-error" role="alert">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="button danger" onClick={() => void remove()} disabled={busy}>
          {busy ? "Deleting…" : "Yes, delete it"}
        </button>
        <button type="button" className="button ghost" onClick={() => setConfirming(false)} disabled={busy}>
          Keep my account
        </button>
      </div>
    </div>
  );
}
