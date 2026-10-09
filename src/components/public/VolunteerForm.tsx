"use client";

import { useState, type FormEvent } from "react";
import { londonDayKey } from "@/lib/planTime";
import { COMMITMENTS, INTERESTS, type FreeBlock, type Volunteer } from "@/lib/volunteers";
import { FreeTimeGrid } from "./FreeTimeGrid";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done" }
  | { kind: "removed" }
  | { kind: "error"; message: string };

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/** Ticks for a list of options, laid out as a wrapping grid of checkboxes. */
function Choices({
  options,
  value,
  onChange,
}: {
  options: readonly { key: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="pub-choices">
      {options.map((o) => (
        <label key={o.key} className="pub-choice">
          <input type="checkbox" checked={value.includes(o.key)} onChange={() => onChange(toggle(value, o.key))} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * The volunteer sign-up, for someone signed in with UCL: their name and email
 * come from that, and a returning volunteer sees their answers to change.
 * Every level of time counts, from a single drop-in to several times a week,
 * so only how often is required.
 */
export function VolunteerForm({
  signedInAs,
  existing,
}: {
  signedInAs: { name: string; email: string };
  existing: Volunteer | null;
}) {
  const [study, setStudy] = useState(existing?.study ?? "");
  const [commitment, setCommitment] = useState<string>(existing?.commitment ?? "");
  const [until, setUntil] = useState(existing?.available_until ?? "");
  const [freeTimes, setFreeTimes] = useState<FreeBlock[]>(existing?.free_times ?? []);
  const [interests, setInterests] = useState<string[]>(existing?.interests ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [consent, setConsent] = useState(Boolean(existing));
  const [onList, setOnList] = useState(Boolean(existing));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [today] = useState(() => londonDayKey(new Date()));

  async function remove() {
    if (!window.confirm("Take yourself off VolSoc's volunteer list?")) return;
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/volunteers", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong, try again in a minute");
      setOnList(false);
      setConsent(false);
      setStatus({ kind: "removed" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong" });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/volunteers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ study, commitment, available_until: until, free_times: freeTimes, interests, notes, consent }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong, try again in a minute");
      setOnList(true);
      setStatus({ kind: "done" });
      window.scrollTo({ top: 0 });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong" });
    }
  }

  if (status.kind === "done") {
    return (
      <div className="notice ok" role="status">
        <strong>You&apos;re on the list, thank you</strong>
        <p>
          We&apos;ll be in touch at {signedInAs.email} when something comes up that fits. Come back to this page any time to
          change your answers
        </p>
        <button type="button" className="button small" onClick={() => setStatus({ kind: "idle" })}>
          See my answers
        </button>
      </div>
    );
  }

  return (
    <form className="panel pub-form" onSubmit={submit}>
      {status.kind === "removed" && (
        <div className="notice ok" role="status">
          <strong>You&apos;re off the list</strong>
          <p>Changed your mind? Fill this in again whenever you like</p>
        </div>
      )}

      <fieldset>
        <legend className="micro-label">About you</legend>
        <p className="pub-signed-in">
          Signed in as <strong>{signedInAs.name}</strong> <span className="muted">{signedInAs.email}</span>
        </p>
        <div className="field">
          <label htmlFor="v-study">Course and year</label>
          <input id="v-study" placeholder="Optional, e.g. BSc Geography, 2nd year" value={study} onChange={(e) => setStudy(e.target.value)} />
        </div>
      </fieldset>

      <fieldset>
        <legend className="micro-label">How often could you help? Any amount helps</legend>
        <div className="pub-choices">
          {COMMITMENTS.map((c) => (
            <label key={c.key} className="pub-choice">
              <input type="radio" name="commitment" required checked={commitment === c.key} onChange={() => setCommitment(c.key)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="micro-label">Around to help until</legend>
        <div className="field pub-until">
          <input
            id="v-until"
            type="date"
            aria-label="Around to help until"
            min={today}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
          <span className="hint">Leave it blank if you&apos;ve no end in mind</span>
        </div>
      </fieldset>

      <fieldset>
        <legend className="micro-label">When in a typical week?</legend>
        <FreeTimeGrid value={freeTimes} onChange={setFreeTimes} />
      </fieldset>

      <fieldset>
        <legend className="micro-label">What would you like to do?</legend>
        <Choices options={INTERESTS} value={interests} onChange={setInterests} />
      </fieldset>

      <div className="field">
        <label htmlFor="v-notes">Anything else</label>
        <textarea
          id="v-notes"
          maxLength={1000}
          placeholder="Skills, languages, a DBS check, access needs, anything you'd like us to know"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <label className="pub-choice pub-consent">
        <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I give VolSoc permission to keep these details and contact me with Volunteering opportunities until I
          unsubscribe
        </span>
      </label>

      {status.kind === "error" && (
        <div className="notice bad" role="alert">
          <strong>That didn&apos;t send</strong>
          <p>{status.message}</p>
        </div>
      )}

      <div className="pub-actions">
        <button type="submit" className="button primary" disabled={status.kind === "sending"}>
          {status.kind === "sending" ? "Sending…" : onList ? "Save my answers" : "Sign me up"}
        </button>
        {onList && (
          <button type="button" className="button danger" onClick={remove} disabled={status.kind === "sending"}>
            Take me off the list
          </button>
        )}
      </div>
    </form>
  );
}
