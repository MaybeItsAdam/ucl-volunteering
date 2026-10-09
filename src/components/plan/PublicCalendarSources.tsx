"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import type { PublicCalendarSource } from "@/lib/communityFeeds";

async function send(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: init.body ? { "content-type": "application/json" } : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Couldn't reach the server, check your connection");
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(typeof data.error === "string" ? data.error : `Request failed (${response.status})`);
  return data;
}

function syncedLabel(at: string | null): string {
  if (!at) return "Not synced yet";
  return `Synced ${new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`;
}

/**
 * The calendars on the public calendar: the ones the Toolbox's `altruism` tag
 * brings, and the ones the committee adds here by pasting an iCal link (or a
 * Campus Toolbox society's page). Added calendars sync daily with the rest.
 */
export function PublicCalendarSources({ initial }: { initial: PublicCalendarSource[] }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [label, setLabel] = useState("");
  const [colour, setColour] = useState("#10c4c0");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: "ok" | "bad";
    text: string;
  } | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { events } = await send("/api/community-feeds", {
        method: "POST",
        body: JSON.stringify({ link, label, colour }),
      });
      setMessage({
        tone: "ok",
        text: `Added, with ${events} upcoming event${events === 1 ? "" : "s"}`,
      });
      setLink("");
      setLabel("");
      router.refresh();
    } catch (error) {
      setMessage({
        tone: "bad",
        text: error instanceof Error ? error.message : "Couldn't add it",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(source: PublicCalendarSource) {
    if (!window.confirm(`Take ${source.name} off the public calendar?`)) return;
    setRemoving(source.id);
    setMessage(null);
    try {
      await send(`/api/community-feeds/${encodeURIComponent(source.id)}`, {
        method: "DELETE",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: "bad",
        text: error instanceof Error ? error.message : "Couldn't remove it",
      });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="pcs">
      <form className="panel pcs-add" onSubmit={add}>
        <h2 className="micro-label">Add a calendar</h2>
        <div className="pcs-add-row">
          <div className="field pcs-link">
            <label htmlFor="pcs-link">iCal link</label>
            <input
              id="pcs-link"
              type="url"
              inputMode="url"
              required
              placeholder="webcal://… or a Campus Toolbox society page"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <div className="field pcs-name">
            <label htmlFor="pcs-name">Name</label>
            <input
              id="pcs-name"
              maxLength={80}
              placeholder="Shown on each event"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="field pcs-colour">
            <label htmlFor="pcs-colour">Colour</label>
            <input id="pcs-colour" type="color" value={colour} onChange={(e) => setColour(e.target.value)} />
          </div>
          <button type="submit" className="button primary pcs-submit" disabled={busy}>
            {busy ? "Checking…" : "Add"}
          </button>
        </div>
        <p className="muted small pcs-hint">
          Any calendar that gives a subscribe link works: Google, Outlook, Eventbrite, a Toolbox society. A name is
          needed except for Toolbox societies, which bring their own
        </p>
        {message && (
          <p className={`small pcs-message ${message.tone}`} role={message.tone === "bad" ? "alert" : "status"}>
            {message.text}
          </p>
        )}
      </form>

      {initial.length > 0 && (
        <div className="panel flush">
          <ul className="pcs-list">
            {initial.map((source) => (
              <li key={source.id} className="pcs-row">
                <span className="pcs-swatch" style={{ background: source.colour ?? "var(--muted)" }} aria-hidden />
                <div className="pcs-main">
                  <strong>{source.name}</strong>
                  <span className="muted small">
                    {source.events} upcoming · {syncedLabel(source.lastSyncedAt)}
                    {source.feedUrl && (
                      <>
                        {" · "}
                        <a href={source.feedUrl} target="_blank" rel="noreferrer" className="pcs-feed">
                          Feed <ExternalLink size={11} aria-hidden />
                        </a>
                      </>
                    )}
                  </span>
                  {source.lastError && <span className="small pcs-error">{source.lastError}</span>}
                </div>
                <span className={`tag${source.manual ? " info" : ""}`}>{source.manual ? "Added" : "Toolbox"}</span>
                {source.manual ? (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${source.name}`}
                    disabled={removing === source.id}
                    onClick={() => remove(source)}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                ) : (
                  <span className="pcs-spacer" aria-hidden />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
