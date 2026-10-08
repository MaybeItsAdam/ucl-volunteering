"use client";

import { useState, type FormEvent } from "react";
import { COUNTS, OUTLETS, type CountKey } from "@/lib/zeroFoodWaste";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done"; outlet: string; total: number } | { kind: "error"; message: string };

const OTHER = "__other";
const blankCounts = () => Object.fromEntries(COUNTS.map((c) => [c.key, ""])) as Record<CountKey, string>;

/**
 * One outlet's collection on one shift. After a save the date and shift
 * leader stay filled in, since a shift usually covers several outlets.
 */
export function ZeroFoodWasteForm({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [outlet, setOutlet] = useState("");
  const [otherOutlet, setOtherOutlet] = useState("");
  const [shiftLeader, setShiftLeader] = useState("");
  const [counts, setCounts] = useState(blankCounts);
  const [incentives, setIncentives] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const total = COUNTS.reduce((sum, c) => sum + (Number(counts[c.key]) || 0), 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = outlet === OTHER ? otherOutlet.trim() : outlet;
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/zero-food-waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, outlet: name, shiftLeader, counts, incentives, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; total?: number };
      if (!res.ok) throw new Error(data.error || "Something went wrong, try again in a minute");
      setStatus({ kind: "done", outlet: name, total: data.total ?? total });
      setOutlet("");
      setOtherOutlet("");
      setCounts(blankCounts());
      setIncentives("");
      window.scrollTo({ top: 0 });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong" });
    }
  }

  return (
    <>
      {status.kind === "done" && (
        <div className="notice ok" role="status">
          <strong>
            Logged {status.total} item{status.total === 1 ? "" : "s"} from {status.outlet}
          </strong>
          <p>Thank you! Collected from another outlet on this shift? Add it below</p>
        </div>
      )}
      <form className="panel pub-form" onSubmit={submit}>
        <fieldset>
          <legend className="micro-label">The shift</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="z-date">Date</label>
              <input id="z-date" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="z-leader">Shift leader</label>
              <input id="z-leader" required autoComplete="name" value={shiftLeader} onChange={(e) => setShiftLeader(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="z-outlet">Outlet</label>
            <select id="z-outlet" required value={outlet} onChange={(e) => setOutlet(e.target.value)}>
              <option value="" disabled>
                Pick the outlet
              </option>
              {OUTLETS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              <option value={OTHER}>Somewhere else…</option>
            </select>
          </div>
          {outlet === OTHER && (
            <div className="field">
              <label htmlFor="z-other">Which outlet?</label>
              <input id="z-other" required value={otherOutlet} onChange={(e) => setOtherOutlet(e.target.value)} />
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="micro-label">What you collected</legend>
          <p className="muted small">Number of items; leave anything you didn&apos;t get blank</p>
          <div className="pub-counts">
            {COUNTS.map((c) => (
              <div key={c.key} className="field">
                <label htmlFor={`z-${c.key}`}>{c.label}</label>
                <input
                  id={`z-${c.key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={2000}
                  step={1}
                  value={counts[c.key]}
                  onChange={(e) => setCounts({ ...counts, [c.key]: e.target.value })}
                />
                {c.hint && <span className="hint">{c.hint}</span>}
              </div>
            ))}
            <div className="field">
              <label htmlFor="z-incentives">Incentives</label>
              <input
                id="z-incentives"
                type="number"
                inputMode="numeric"
                min={0}
                max={2000}
                step={1}
                value={incentives}
                onChange={(e) => setIncentives(e.target.value)}
              />
            </div>
          </div>
          <p className="pub-total">
            <span className="micro-label">Total</span>
            <span className="mono">{total}</span>
          </p>
        </fieldset>

        <div className="pub-honeypot" aria-hidden="true">
          <label htmlFor="z-website">Website</label>
          <input id="z-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        {status.kind === "error" && (
          <div className="notice bad" role="alert">
            <strong>That didn&apos;t save</strong>
            <p>{status.message}</p>
          </div>
        )}

        <button type="submit" className="button primary" disabled={status.kind === "sending" || total === 0}>
          {status.kind === "sending" ? "Saving…" : "Log it"}
        </button>
      </form>
    </>
  );
}
