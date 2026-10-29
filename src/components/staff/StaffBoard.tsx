"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, MessageCircle } from "lucide-react";
import { OUTLETS } from "@/lib/zeroFoodWaste";
import { WINDOW_MINUTES, type CollectionAlert } from "@/lib/collections";
import { londonTime } from "@/lib/planTime";

interface Posted {
  alert: CollectionAlert;
  push: { sent: number; failed: number; skipped: number };
  whatsapp: { text: string; link: string };
}

const windowLabel = (minutes: number) => (minutes < 60 ? `${minutes} minutes` : minutes === 60 ? "1 hour" : `${minutes / 60} hours`);

const OUTLET_KEY = "volsoc:staff-outlet";

function lastOutlet() {
  try {
    return localStorage.getItem(OUTLET_KEY) ?? "";
  } catch {
    return "";
  }
}

/** One line on what the push did, honest about the cases where it did nothing. */
function pushSummary({ sent, failed, skipped }: Posted["push"]): string {
  if (sent > 0) return `Sent to ${sent} ${sent === 1 ? "phone" : "phones"}`;
  if (skipped > 0) return "Phone alerts aren't switched on yet — share it on WhatsApp so people see it";
  if (failed > 0) return "The phone alerts didn't go out — share it on WhatsApp so people see it";
  return "Nobody has switched on alerts yet — share it on WhatsApp so people see it";
}

export function StaffBoard({ name, organisation, open }: { name: string; organisation: string; open: CollectionAlert[] }) {
  const router = useRouter();
  const [outlet, setOutlet] = useState(lastOutlet);
  const [what, setWhat] = useState("");
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState<number>(120);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outlet, what, note, minutes }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as (Posted & { error?: string }) | null;
    setBusy(false);
    if (!res?.ok || !body?.alert) return setError(body?.error || "Couldn't post that, try again");
    try {
      localStorage.setItem(OUTLET_KEY, outlet);
    } catch {
      // The outlet just isn't remembered.
    }
    setPosted(body);
    setWhat("");
    setNote("");
    router.refresh();
  }

  async function close(id: string, status: "collected" | "withdrawn") {
    const res = await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (res && (res.ok || res.status === 404)) router.refresh();
    else setError("Couldn't update that, try again");
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the WhatsApp button still works.
    }
  }

  async function signOut() {
    await fetch("/api/staff/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <>
      <p className="muted pub-lede">
        Signed in as {name}, {organisation}.{" "}
        <button type="button" className="col-link" onClick={signOut}>
          Sign out
        </button>
      </p>

      {posted && (
        <div className="notice ok col-posted" role="status">
          <strong>Posted for {posted.alert.outlet}</strong>
          <p>{pushSummary(posted.push)}</p>
          <div className="col-actions">
            <a className="button primary" href={posted.whatsapp.link} target="_blank" rel="noreferrer">
              <MessageCircle size={16} aria-hidden="true" /> Share on WhatsApp
            </a>
            <button type="button" className="button" onClick={() => copy(posted.whatsapp.text)}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? "Copied" : "Copy message"}
            </button>
          </div>
        </div>
      )}

      <form className="panel col-form" onSubmit={submit}>
        <h2 className="micro-label">Food ready to collect</h2>
        <div className="field">
          <label htmlFor="col-outlet">Outlet</label>
          <input id="col-outlet" list="col-outlets" value={outlet} onChange={(e) => setOutlet(e.target.value)} maxLength={80} autoComplete="off" required />
          <datalist id="col-outlets">
            {OUTLETS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="col-what">What there is</label>
          <input id="col-what" value={what} onChange={(e) => setWhat(e.target.value)} maxLength={200} placeholder="12 sandwiches and a tray of brownies" required />
        </div>
        <div className="field">
          <label htmlFor="col-minutes">There for</label>
          <select id="col-minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {WINDOW_MINUTES.map((m) => (
              <option key={m} value={m}>
                {windowLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="col-note">Where to ask (optional)</label>
          <input id="col-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ask at the till" />
        </div>
        {error && <p className="col-error" role="alert">{error}</p>}
        <button type="submit" className="button primary" disabled={busy || !outlet.trim() || !what.trim()}>
          {busy ? "Posting…" : "Tell the volunteers"}
        </button>
      </form>

      {open.length > 0 && (
        <section className="panel" aria-labelledby="col-open-title">
          <h2 id="col-open-title" className="micro-label">
            Out now
          </h2>
          <ul className="col-list">
            {open.map((a) => (
              <li key={a.id}>
                <div>
                  <strong>{a.outlet}</strong>
                  <span className="muted small">
                    {a.what} · until {londonTime(new Date(a.collect_by))}
                  </span>
                </div>
                <div className="col-actions">
                  <button type="button" className="button small" onClick={() => close(a.id, "collected")}>
                    All taken
                  </button>
                  <button type="button" className="button small ghost" onClick={() => close(a.id, "withdrawn")}>
                    Posted by mistake
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
