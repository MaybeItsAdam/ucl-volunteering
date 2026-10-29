"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ActivityItem } from "@/lib/activity";

const stamp = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/**
 * Who did what to a task or an event, newest first, loaded when it opens. On a
 * task it also takes comments, which land in the same list.
 */
export function ActivityFeed({ type, id, canComment = false }: { type: "task" | "event"; id: string; canComment?: boolean }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped after a comment, to read the list again.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/activity?type=${type}&id=${id}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { items?: ActivityItem[] } | null;
        if (!res.ok || !data?.items) throw new Error();
        if (live) {
          setItems(data.items);
          setFailed(false);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [type, id, version]);

  async function comment(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tasks/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft }),
    }).catch(() => null);
    if (res?.ok) {
      setDraft("");
      setVersion((v) => v + 1);
    } else {
      const data = (await res?.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error || "Couldn't save that, try again");
    }
    setBusy(false);
  }

  return (
    <section className="activity" aria-label="History">
      <h4 className="micro-label">{canComment ? "Comments and history" : "History"}</h4>
      {canComment && (
        <form className="activity-form" onSubmit={comment}>
          <label htmlFor={`activity-${id}`} className="sr-only">
            Add a comment
          </label>
          <textarea id={`activity-${id}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} placeholder="Add a comment" rows={2} />
          <button type="submit" className="button small" disabled={busy || !draft.trim()}>
            {busy ? "Posting…" : "Comment"}
          </button>
          {error && <span className="planner-error" role="alert">{error}</span>}
        </form>
      )}
      {failed ? (
        <p className="muted small">The history couldn&apos;t be loaded</p>
      ) : items === null ? (
        <p className="muted small">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted small">Nothing yet. Changes from now on are recorded here</p>
      ) : (
        <ul className="activity-list">
          {items.map((item) => (
            <li key={item.id}>
              <p>
                <strong>{item.actor?.name ?? "Someone"}</strong> {item.lines.join(", ")}
                <time className="muted small" dateTime={item.at}>
                  {" "}
                  · {stamp.format(new Date(item.at))}
                </time>
              </p>
              {item.comment && <blockquote>{item.comment}</blockquote>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
