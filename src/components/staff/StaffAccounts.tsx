"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy } from "lucide-react";

export interface StaffRow {
  id: string;
  name: string;
  organisation: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

/**
 * CH&Co people who can post collection alerts. A new one gets a code shown
 * once, with the link that signs them in; losing it means switching them off
 * and making another.
 */
export function StaffAccounts({ initial }: { initial: StaffRow[] }) {
  const [staff, setStaff] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; code: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/staff-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string; staff?: StaffRow; code?: string } | null;
    setBusy(false);
    if (!res?.ok || !body?.staff || !body.code) return setError(body?.error || "Couldn't make a code, try again");
    setStaff((list) => [body.staff!, ...list]);
    setIssued({ name: body.staff.name, code: body.code, link: `${window.location.origin}/staff#${body.code}` });
    setName("");
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/staff-accounts/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setError("Couldn't switch that off, try again");
    setStaff((list) => list.map((s) => (s.id === id ? { ...s, revoked_at: new Date().toISOString() } : s)));
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the link is on screen to select.
    }
  }

  return (
    <section className="panel" aria-labelledby="staff-title">
      <h2 id="staff-title" className="micro-label">
        CH&amp;Co staff
      </h2>
      <p className="muted small">
        People at CH&amp;Co who can tell volunteers there is food to collect, at /staff. Each gets their own link, so one can be switched off without
        affecting the rest
      </p>

      {issued && (
        <div className="notice warn" role="status">
          <strong>
            Code for {issued.name}: <span className="mono">{issued.code}</span>
          </strong>
          <p>This is the only time it&apos;s shown. Send them the link; opening it signs them in</p>
          <p className="mono small" style={{ wordBreak: "break-all" }}>{issued.link}</p>
          <button type="button" className="button small" onClick={() => copy(issued.link)}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}

      <form className="col-add" onSubmit={add}>
        <div className="field">
          <label htmlFor="staff-name">Name</label>
          <input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" />
        </div>
        <button type="submit" className="button primary" disabled={busy || !name.trim()}>
          {busy ? "Making…" : "Make a code"}
        </button>
      </form>
      {error && <p className="col-error" role="alert">{error}</p>}

      {staff.length > 0 && (
        <ul className="col-list">
          {staff.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <span className="muted small">
                  {s.organisation} · {s.last_seen_at ? `last on ${dateFormat.format(new Date(s.last_seen_at))}` : "hasn't signed in yet"}
                </span>
              </div>
              {s.revoked_at ? (
                <span className="tag bad">Switched off</span>
              ) : (
                <button type="button" className="button small danger" onClick={() => revoke(s.id)}>
                  Switch off
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
