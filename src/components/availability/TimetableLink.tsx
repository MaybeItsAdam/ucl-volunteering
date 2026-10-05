"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ExternalLink, Lock } from "lucide-react";
import type { TimetableStatus } from "@/lib/timetable";

// Same as UCL_TIMETABLE_SITE in lib/timetableFeed, which is server-only (it uses node:dns).
const UCL_TIMETABLE_SITE = "https://timetable.ucl.ac.uk";

/** Server messages put each sentence on its own line, with no full stops. */
function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line) => (
        <span key={line} className="timetable-line">
          {line}
        </span>
      ))}
    </>
  );
}

function syncedLabel(iso: string | null): string {
  if (!iso) return "Not synced yet";
  const at = new Date(iso);
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const day = at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
  return `Synced ${day} ${time}`;
}

/**
 * Link your UCL timetable: paste the Subscribe link once and your lectures
 * show as busy time on the plan. The link goes to the server and never comes
 * back; this only ever sees whether one is saved.
 */
export function TimetableLink({ initialStatus }: { initialStatus: TimetableStatus | null }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [editing, setEditing] = useState(!initialStatus?.linked);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/timetable", {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => ({}))) as { status?: TimetableStatus; error?: string };
      if (!response.ok || !data.status) {
        setError(data.error || "Something went wrong\nTry again in a minute");
        return;
      }
      setStatus(data.status);
      setEditing(!data.status.linked);
      setUrl("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server\nCheck your connection");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send("PUT", { url });
  }

  if (!status) return null;

  return (
    <section className="panel timetable-link" aria-labelledby="timetable-link-title">
      <header className="timetable-link-head">
        <h2 id="timetable-link-title" className="micro-label">
          <CalendarClock size={14} aria-hidden="true" />
          Your UCL timetable
        </h2>
        {status.linked && (
          <span className={`tag ${status.lastStatus === "error" ? "bad" : "ok"}`}>
            {status.lastStatus === "error" ? "Sync problem" : "Linked"}
          </span>
        )}
      </header>

      {!status.configured ? (
        <p className="timetable-muted">Timetable links aren&rsquo;t set up on this site yet</p>
      ) : (
        <>
          <p className="timetable-muted">
            <Lines text={"Your lectures show as busy time on the plan\nThe committee sees only that you're busy, never which class or room"} />
          </p>

          {status.linked && (
            <div className="timetable-state">
              <span className="mono">{syncedLabel(status.lastFetchedAt)}</span>
              <span className="mono">
                {status.sessionCount} {status.sessionCount === 1 ? "session" : "sessions"}
              </span>
            </div>
          )}

          {status.linked && status.lastStatus === "error" && status.lastError && (
            <p className="timetable-error" role="status">
              <Lines text={status.lastError} />
            </p>
          )}

          {editing ? (
            <form className="timetable-form" onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="timetable-url">Subscribe link</label>
                <input
                  id="timetable-url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="webcal://www.ucl.ac.uk/timetable/ics/…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={busy}
                  aria-invalid={error ? true : undefined}
                  aria-describedby="timetable-url-hint"
                />
                <span id="timetable-url-hint" className="hint">
                  <Lines text={"On the UCL timetable, tap Subscribe and copy the link it gives you"} />
                </span>
                {error && (
                  <span className="error" role="alert">
                    <Lines text={error} />
                  </span>
                )}
              </div>
              <div className="timetable-actions">
                <button type="submit" className="button primary" disabled={busy || !url.trim()}>
                  {busy ? "Checking link…" : status.linked ? "Replace link" : "Link timetable"}
                </button>
                {status.linked && (
                  <button type="button" className="button ghost" onClick={() => setEditing(false)} disabled={busy}>
                    Cancel
                  </button>
                )}
                <a className="button ghost" href={UCL_TIMETABLE_SITE} target="_blank" rel="noreferrer">
                  Open UCL timetable
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </div>
            </form>
          ) : (
            <>
              {error && (
                <p className="timetable-error" role="alert">
                  <Lines text={error} />
                </p>
              )}
              <div className="timetable-actions">
                <button type="button" className="button" onClick={() => setEditing(true)} disabled={busy}>
                  Replace link
                </button>
                <button type="button" className="button danger" onClick={() => void send("DELETE")} disabled={busy}>
                  {busy ? "Removing…" : "Remove"}
                </button>
              </div>
            </>
          )}

          <p className="timetable-note">
            <Lock size={12} aria-hidden="true" />
            <span>The link is stored encrypted and never shown again</span>
          </p>
        </>
      )}
    </section>
  );
}
