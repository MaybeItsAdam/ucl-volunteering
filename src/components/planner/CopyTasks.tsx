"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { eventOptionLabel, type EventOption } from "./format";

/**
 * "Copy tasks from…" on an event: the checklist you rebuild every time. Picks
 * an earlier event and copies its items here as fresh Backlog items, due dates
 * keeping their distance from the event.
 */
export function CopyTasks({ toEventId, events }: { toEventId: string; events: EventOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function copy() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/tasks/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromEventId: from, toEventId }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { created?: number; error?: string } | null;
    setBusy(false);
    if (!res?.ok) return setMessage({ tone: "bad", text: data?.error || "Couldn't copy those, try again" });
    const n = data?.created ?? 0;
    setMessage({ tone: "ok", text: n ? `Copied ${n} ${n === 1 ? "item" : "items"} into Backlog` : "Nothing new to copy: this event already has them" });
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="button small" onClick={() => setOpen(true)}>
        <Copy size={14} aria-hidden="true" />
        Copy tasks from…
      </button>
    );
  }
  return (
    <span className="planner-copy">
      <label>
        <span className="sr-only">Copy from</span>
        <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">Pick an event</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {eventOptionLabel(e)}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="button small primary" onClick={copy} disabled={!from || busy}>
        {busy ? "Copying…" : "Copy"}
      </button>
      {message && (
        <span className={message.tone === "bad" ? "planner-error" : "muted small"} role="status">
          {message.text}
        </span>
      )}
    </span>
  );
}
