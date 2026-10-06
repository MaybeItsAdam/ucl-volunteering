"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ExternalLink, Lock, Plus } from "lucide-react";
import type { CalendarLinkSummary, CalendarLinksState } from "@/lib/calendarLinks";
import { CALENDAR_KINDS, MAX_LABEL_LENGTH, PROVIDERS, type CalendarKind } from "@/lib/calendarProviders";

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

function countLabel(link: CalendarLinkSummary): string {
  const noun = link.kind === "ucl_timetable" ? "session" : "busy time";
  return `${link.blockCount} ${noun}${link.blockCount === 1 ? "" : "s"}`;
}

/** The picker's short names; the list uses the full ones. */
const PICKER_NAMES: Record<CalendarKind, string> = {
  ucl_timetable: "UCL timetable",
  google: "Google",
  outlook: "Outlook",
  icloud: "iCloud",
};

type Pending = { action: "add" } | { action: "remove" | "sync"; id: string };

/**
 * Your linked calendars: the UCL timetable and personal Google, Outlook and
 * iCloud calendars, all shown as busy time on the plan. Each link goes to the
 * server once and never comes back; this only ever sees which provider, its
 * name and how its last sync went.
 */
export function MyCalendars({ initialState }: { initialState: CalendarLinksState | null }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const hasTimetable = Boolean(state?.links.some((l) => l.kind === "ucl_timetable"));
  const [adding, setAdding] = useState(Boolean(state && state.links.length === 0));
  const [kind, setKind] = useState<CalendarKind>(hasTimetable ? "google" : "ucl_timetable");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<{ text: string; id?: string } | null>(null);

  async function send(next: Pending, method: "POST" | "DELETE", path: string, body?: unknown) {
    setPending(next);
    setError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => ({}))) as { state?: CalendarLinksState; error?: string };
      if (!response.ok || !data.state) {
        setError({ text: data.error || "Something went wrong\nTry again in a minute", id: "id" in next ? next.id : undefined });
        return false;
      }
      setState(data.state);
      router.refresh();
      return true;
    } catch {
      setError({ text: "Couldn't reach the server\nCheck your connection", id: "id" in next ? next.id : undefined });
      return false;
    } finally {
      setPending(null);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await send({ action: "add" }, "POST", "/api/calendar-links", {
      kind,
      url,
      label: kind === "ucl_timetable" ? undefined : label,
    });
    if (ok) {
      setAdding(false);
      setUrl("");
      setLabel("");
    }
  }

  function pick(next: CalendarKind) {
    setKind(next);
    setError(null);
  }

  if (!state) return null;

  const busy = pending !== null;
  const full = state.links.length >= state.max;
  // A new UCL timetable replaces the old one, so it never counts against the cap.
  const blocked = full && !(kind === "ucl_timetable" && hasTimetable);
  const provider = PROVIDERS[kind];
  const addError = error && !error.id ? error.text : null;

  return (
    <section className="panel timetable-link my-calendars" aria-labelledby="my-calendars-title">
      <header className="timetable-link-head">
        <h2 id="my-calendars-title" className="micro-label">
          <CalendarClock size={14} aria-hidden="true" />
          My calendars
        </h2>
        {state.configured && (
          <span className="mono my-calendars-count">
            {state.links.length} of {state.max}
          </span>
        )}
      </header>

      {!state.configured ? (
        <p className="timetable-muted">Calendar links aren&rsquo;t set up on this site yet</p>
      ) : (
        <>
          <p className="timetable-muted">
            <Lines text={"Your lectures and other calendars show as busy time on the plan\nThe committee sees only that you're busy, never what or where"} />
          </p>

          {state.links.length > 0 && (
            <ul className="my-calendars-list">
              {state.links.map((link) => {
                const p = PROVIDERS[link.kind];
                const rowBusy = pending && "id" in pending && pending.id === link.id ? pending.action : null;
                return (
                  <li key={link.id} className="my-calendars-item">
                    <div className="my-calendars-row">
                      <span className="my-calendars-name">
                        <strong>{link.label ?? p.name}</strong>
                        {link.label && <span className="timetable-muted">{p.name}</span>}
                      </span>
                      <span className={`tag ${link.lastStatus === "error" ? "bad" : link.lastStatus === "ok" ? "ok" : ""}`}>
                        {link.lastStatus === "error" ? "Sync problem" : link.lastStatus === "ok" ? "Synced" : "Waiting"}
                      </span>
                    </div>
                    <div className="timetable-state">
                      <span className="mono">{syncedLabel(link.lastFetchedAt)}</span>
                      <span className="mono">{countLabel(link)}</span>
                    </div>
                    {link.lastStatus === "error" && link.lastError && (
                      <p className="timetable-error" role="status">
                        <Lines text={link.lastError} />
                      </p>
                    )}
                    {error?.id === link.id && (
                      <p className="timetable-error" role="alert">
                        <Lines text={error.text} />
                      </p>
                    )}
                    <div className="timetable-actions">
                      <button
                        type="button"
                        className="button small"
                        disabled={busy}
                        onClick={() => void send({ action: "sync", id: link.id }, "POST", "/api/calendar-links/refresh", { id: link.id })}
                      >
                        {rowBusy === "sync" ? "Syncing…" : "Sync now"}
                      </button>
                      <button
                        type="button"
                        className="button small danger"
                        disabled={busy}
                        aria-label={`Remove ${link.label ?? p.name}`}
                        onClick={() => void send({ action: "remove", id: link.id }, "DELETE", `/api/calendar-links?id=${link.id}`)}
                      >
                        {rowBusy === "remove" ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {adding ? (
            <form className="timetable-form my-calendars-add" onSubmit={onSubmit}>
              <p className="micro-label my-calendars-add-title">Add a calendar</p>
              <div className="segmented my-calendars-picker" role="group" aria-label="Which calendar">
                {CALENDAR_KINDS.map((k) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => pick(k)} disabled={busy}>
                    {PICKER_NAMES[k]}
                  </button>
                ))}
              </div>

              <div className="my-calendars-howto">
                <span className="micro-label">How to find the link</span>
                <ol className="my-calendars-steps">
                  {provider.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {provider.note && <p className="timetable-muted my-calendars-small">{provider.note}</p>}
                <a className="button ghost small my-calendars-open" href={provider.site} target="_blank" rel="noreferrer">
                  Open {provider.name}
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </div>

              <div className="field">
                <label htmlFor="calendar-url">{kind === "ucl_timetable" ? "Subscribe link" : "Calendar link"}</label>
                <input
                  id="calendar-url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={provider.placeholder}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={busy}
                  aria-invalid={addError ? true : undefined}
                  aria-describedby="calendar-url-hint"
                />
                <span id="calendar-url-hint" className="hint">
                  {kind === "ucl_timetable" && hasTimetable
                    ? "This replaces the timetable you've already linked"
                    : "Only the times of your events are kept, never what they are"}
                </span>
                {addError && (
                  <span className="error" role="alert">
                    <Lines text={addError} />
                  </span>
                )}
              </div>

              {kind !== "ucl_timetable" && (
                <div className="field">
                  <label htmlFor="calendar-label">Name, if you like</label>
                  <input
                    id="calendar-label"
                    type="text"
                    autoComplete="off"
                    maxLength={MAX_LABEL_LENGTH}
                    placeholder="Work, Football club…"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    disabled={busy}
                  />
                </div>
              )}

              {blocked && (
                <p className="timetable-error">
                  <Lines text={`You can link up to ${state.max} calendars\nRemove one to add another`} />
                </p>
              )}

              <div className="timetable-actions">
                <button type="submit" className="button primary" disabled={busy || blocked || !url.trim()}>
                  {pending?.action === "add" ? "Checking link…" : kind === "ucl_timetable" && hasTimetable ? "Replace timetable" : "Add calendar"}
                </button>
                {state.links.length > 0 && (
                  <button type="button" className="button ghost" onClick={() => setAdding(false)} disabled={busy}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="timetable-actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setKind(hasTimetable ? "google" : "ucl_timetable");
                  setAdding(true);
                }}
              >
                <Plus size={14} aria-hidden="true" />
                Add a calendar
              </button>
            </div>
          )}

          <p className="timetable-note">
            <Lock size={12} aria-hidden="true" />
            <span>Links are stored encrypted and never shown again</span>
          </p>
        </>
      )}
    </section>
  );
}
