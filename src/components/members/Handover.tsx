"use client";

import { useState } from "react";

interface Person {
  id: string;
  name: string;
}

/**
 * Handover when someone leaves: move everything unfinished that's theirs to
 * someone else in one go. Each moved item is recorded in its history.
 */
export function Handover({ people, committee }: { people: Person[]; committee: Person[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function move() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/tasks/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromId: from, toId: to }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { moved?: number; error?: string } | null;
    setBusy(false);
    if (!res?.ok) return setResult({ tone: "bad", text: data?.error || "Couldn't move those, try again" });
    const n = data?.moved ?? 0;
    setResult({ tone: "ok", text: n ? `Moved ${n} ${n === 1 ? "item" : "items"}` : "They had nothing unfinished" });
  }

  return (
    <section className="panel" aria-labelledby="handover-title">
      <h2 id="handover-title" className="micro-label">
        Handover
      </h2>
      <p className="muted small">Move everything unfinished on the planner from one person to another, for when someone steps down</p>
      <div className="field-row">
        <div className="field">
          <label htmlFor="handover-from">From</label>
          <select id="handover-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Pick someone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="handover-to">To</label>
          <select id="handover-to" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Pick someone on the committee</option>
            {committee
              .filter((p) => p.id !== from)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      <button type="button" className="button primary" onClick={move} disabled={!from || !to || busy}>
        {busy ? "Moving…" : "Move their items"}
      </button>
      {result && (
        <p className={result.tone === "bad" ? "planner-error" : "muted small"} role="status">
          {result.text}
        </p>
      )}
    </section>
  );
}
