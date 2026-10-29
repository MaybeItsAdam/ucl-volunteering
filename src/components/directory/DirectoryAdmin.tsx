"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { CheckCheck, ExternalLink, Plus, Sparkles, Train, Trash2, X } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import {
  CAUSES,
  COMMITMENT_KINDS,
  DBS_OPTIONS,
  isStale,
  SIGNUP_METHODS,
  WEEKDAYS,
  type DirectoryEntry,
  type Session,
} from "@/lib/directory";
import "./directory.css";

/** The editor's form state: the entry's fields, all as the inputs hold them. */
interface Form {
  organisation: string;
  orgUrl: string;
  title: string;
  summary: string;
  description: string;
  causes: string[];
  commitment: string;
  timeNeeded: string;
  signupMethod: string;
  signupUrl: string;
  signupEmail: string;
  signupSteps: string;
  sessions: { weekday: number; start: string; end: string; where: string; note: string }[];
  address: string;
  postcode: string;
  nearestStation: string;
  remote: boolean;
  minAge: string;
  dbs: string;
  expensesPaid: boolean;
  training: string;
  accessibility: string;
  contactName: string;
  contactEmail: string;
  active: boolean;
}

const BLANK: Form = {
  organisation: "",
  orgUrl: "",
  title: "",
  summary: "",
  description: "",
  causes: [],
  commitment: "regular",
  timeNeeded: "",
  signupMethod: "email",
  signupUrl: "",
  signupEmail: "",
  signupSteps: "",
  sessions: [],
  address: "",
  postcode: "",
  nearestStation: "",
  remote: false,
  minAge: "18",
  dbs: "not_needed",
  expensesPaid: false,
  training: "",
  accessibility: "",
  contactName: "",
  contactEmail: "",
  active: true,
};

function formOf(e: DirectoryEntry): Form {
  return {
    organisation: e.organisation,
    orgUrl: e.orgUrl ?? "",
    title: e.title,
    summary: e.summary,
    description: e.description ?? "",
    causes: e.causes,
    commitment: e.commitment,
    timeNeeded: e.timeNeeded ?? "",
    signupMethod: e.signupMethod,
    signupUrl: e.signupUrl ?? "",
    signupEmail: e.signupEmail ?? "",
    signupSteps: e.signupSteps ?? "",
    sessions: e.sessions.map((s: Session) => ({ ...s, where: s.where ?? "", note: s.note ?? "" })),
    address: e.address ?? "",
    postcode: e.postcode ?? "",
    nearestStation: e.nearestStation ?? "",
    remote: e.remote,
    minAge: e.minAge == null ? "" : String(e.minAge),
    dbs: e.dbs,
    expensesPaid: e.expensesPaid,
    training: e.training ?? "",
    accessibility: e.accessibility ?? "",
    contactName: e.contactName ?? "",
    contactEmail: e.contactEmail ?? "",
    active: e.active,
  };
}

/** What autofill sends back: any of the form's fields, sessions without blanks. */
type Draft = Partial<Omit<Form, "sessions" | "minAge">> & {
  minAge?: number;
  sessions?: { weekday: number; start: string; end: string; where: string | null; note: string | null }[];
};

/**
 * Autofill into the form: a field takes the draft's value only if it's still
 * empty (or untouched since it was blank), so nothing typed is overwritten.
 * Returns the form and the fields it filled, for highlighting.
 */
function mergeDraft(form: Form, draft: Draft, isNew: boolean): { form: Form; filled: Set<keyof Form> } {
  const next = { ...form };
  const filled = new Set<keyof Form>();
  const take = <K extends keyof Form>(key: K, value: Form[K]) => {
    next[key] = value;
    filled.add(key);
  };
  for (const [key, value] of Object.entries(draft) as [keyof Draft, unknown][]) {
    if (value === undefined || value === null) continue;
    if (key === "sessions") {
      if (!form.sessions.length) take("sessions", (value as NonNullable<Draft["sessions"]>).map((x) => ({ ...x, where: x.where ?? "", note: x.note ?? "" })));
    } else if (key === "causes") {
      if (!form.causes.length) take("causes", value as string[]);
    } else if (key === "minAge") {
      if (isNew || !form.minAge) take("minAge", String(value));
    } else if (typeof value === "boolean") {
      if (value && !form[key as "remote" | "expensesPaid"]) take(key as "remote" | "expensesPaid", true);
    } else if (key === "commitment" || key === "signupMethod" || key === "dbs") {
      // These start with a default, so a new entry takes the page's answer.
      if (isNew || form[key] === BLANK[key]) take(key, value as string);
    } else if (typeof value === "string" && !(form[key as keyof Form] as string)) {
      take(key as keyof Form, value as never);
    }
  }
  return { form: next, filled };
}

async function send(url: string, method: string, body?: unknown): Promise<{ entry?: DirectoryEntry }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as { entry?: DirectoryEntry; error?: string } | null;
  if (!res.ok) throw new Error(data?.error || "Something went wrong, try again");
  return data ?? {};
}

/** The committee's list of directory entries: add, edit, mark checked, take down. */
export function DirectoryAdmin({ initial, today }: { initial: DirectoryEntry[]; today: string }) {
  const [entries, setEntries] = useState(initial);
  const [editing, setEditing] = useState<DirectoryEntry | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...entries].sort((a, b) => a.organisation.localeCompare(b.organisation) || a.title.localeCompare(b.title));
  const staleCount = entries.filter((e) => e.active && isStale(e.verifiedOn, today)).length;

  function upsert(entry: DirectoryEntry) {
    setEntries((list) => (list.some((e) => e.id === entry.id) ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry]));
  }

  async function verify(entry: DirectoryEntry) {
    setError(null);
    try {
      const { entry: saved } = await send(`/api/directory/${entry.id}`, "PATCH", { verified: true });
      if (saved) upsert(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <div className="page-actions">
        <button type="button" className="button primary" onClick={() => setEditing("new")}>
          <Plus size={16} aria-hidden="true" /> Add a place
        </button>
      </div>

      {staleCount > 0 && (
        <div className="notice warn">
          <strong>
            {staleCount} {staleCount === 1 ? "entry hasn't" : "entries haven't"} been checked in six months
          </strong>
          <p>Check the times and sign-up details are still right, then press &ldquo;Still right&rdquo;. The public page warns visitors until you do</p>
        </div>
      )}
      {error && (
        <p className="planner-error" role="alert">
          {error}
        </p>
      )}

      {sorted.length === 0 ? (
        <div className="panel">
          <p className="empty">Nothing in the directory yet</p>
        </div>
      ) : (
        <div className="panel flush">
          <ul className="rows">
            {sorted.map((e) => {
              const stale = isStale(e.verifiedOn, today);
              return (
                <li key={e.id} className="dir-admin-row">
                  <div className="dir-admin-main">
                    <span className="micro-label">{e.organisation}</span>
                    <button type="button" className="link-button" onClick={() => setEditing(e)}>
                      <strong>{e.title}</strong>
                    </button>
                    <span className="muted small">
                      {!e.active && <span className="tag">Hidden</span>} {stale ? <span className="tag warn">Needs checking</span> : `Checked ${e.verifiedOn}`}
                    </span>
                  </div>
                  <div className="dir-admin-actions">
                    {e.active && (
                      <Link className="button small ghost" href={`/opportunities/${e.slug}`} aria-label={`View ${e.title} on the public page`}>
                        <ExternalLink size={14} aria-hidden="true" />
                      </Link>
                    )}
                    <button type="button" className="button small" onClick={() => verify(e)}>
                      <CheckCheck size={14} aria-hidden="true" /> Still right
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing && (
        <EntrySheet
          entry={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            upsert(saved);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setEntries((list) => list.filter((e) => e.id !== id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function EntrySheet({
  entry,
  onClose,
  onSaved,
  onDeleted,
}: {
  entry: DirectoryEntry | null;
  onClose: () => void;
  onSaved: (entry: DirectoryEntry) => void;
  onDeleted: (id: string) => void;
}) {
  const id = useId();
  const [form, setForm] = useState<Form>(entry ? formOf(entry) : BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState<Set<keyof Form>>(new Set());
  const [source, setSource] = useState("");
  const [reading, setReading] = useState(false);
  const [autofillNote, setAutofillNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [findingStation, setFindingStation] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Once someone edits a filled field, it's theirs.
    setFilled((f) => (f.has(key) ? new Set([...f].filter((k) => k !== key)) : f));
  };
  const marked = (key: keyof Form) => (filled.has(key) ? "" : undefined);

  async function autofill() {
    const value = source.trim();
    if (!value) return;
    setReading(true);
    setAutofillNote(null);
    const isLink = /^https?:\/\/\S+$/i.test(value);
    try {
      const res = await fetch("/api/directory/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isLink ? { url: value } : { text: value }),
      });
      const data = (await res.json().catch(() => null)) as { draft?: Draft; error?: string } | null;
      if (!res.ok || !data?.draft) throw new Error(data?.error || "Autofill didn't work, try again");
      const merged = mergeDraft(form, data.draft, !entry);
      setForm(merged.form);
      setFilled((f) => new Set([...f, ...merged.filled]));
      setAutofillNote(
        merged.filled.size
          ? { tone: "ok", text: `Filled ${merged.filled.size} ${merged.filled.size === 1 ? "field" : "fields"}, marked below. Check each one against the page before saving` }
          : { tone: "bad", text: "Nothing new found there. Try their volunteering page itself, or paste the text" },
      );
    } catch (e) {
      setAutofillNote({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
    }
    setReading(false);
  }

  async function findStation() {
    setFindingStation(true);
    const res = await fetch(`/api/directory/station?postcode=${encodeURIComponent(form.postcode)}`).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { station?: string; error?: string } | null;
    setFindingStation(false);
    if (data?.station) {
      setForm((f) => ({ ...f, nearestStation: data.station! }));
      setFilled((f) => new Set([...f, "nearestStation"]));
    } else setError(data?.error || "Couldn't find a station");
  }
  const setSession = (i: number, patch: Partial<Form["sessions"][number]>) =>
    set(
      "sessions",
      form.sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { entry: saved } = entry ? await send(`/api/directory/${entry.id}`, "PATCH", form) : await send("/api/directory", "POST", form);
      if (saved) onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry || !window.confirm(`Delete ${entry.title} from the directory? Hiding it keeps it for later`)) return;
    setBusy(true);
    try {
      await send(`/api/directory/${entry.id}`, "DELETE");
      onDeleted(entry.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const field = (key: keyof Form, label: string, props: { placeholder?: string; type?: string; hint?: string; maxLength?: number } = {}) => (
    <div className="field" data-autofilled={marked(key)}>
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input
        id={`${id}-${key}`}
        type={props.type ?? "text"}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
      />
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );
  const area = (key: keyof Form, label: string, placeholder: string, maxLength: number) => (
    <div className="field" data-autofilled={marked(key)}>
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <textarea id={`${id}-${key}`} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)} placeholder={placeholder} maxLength={maxLength} />
    </div>
  );
  const select = (key: keyof Form, label: string, options: readonly { key: string; label: string }[]) => (
    <div className="field" data-autofilled={marked(key)}>
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <select id={`${id}-${key}`} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Sheet onClose={onClose} labelledBy={`${id}-head`}>
      <form onSubmit={save} noValidate>
        <h3 id={`${id}-head`}>{entry ? `Edit ${entry.title}` : "Add a place"}</h3>
        <div className="dir-autofill">
          <label htmlFor={`${id}-source`} className="micro-label">
            <Sparkles size={12} aria-hidden="true" /> Autofill
          </label>
          <textarea
            id={`${id}-source`}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Paste their volunteering page's link, or the text of a listing or email"
            rows={2}
          />
          <div className="dir-autofill-actions">
            <button type="button" className="button small" onClick={autofill} disabled={reading || !source.trim()}>
              {reading ? "Reading…" : "Fill in from this"}
            </button>
            <span className="muted small">Fills only what it finds, and never what you&apos;ve typed</span>
          </div>
          {autofillNote && (
            <p className={autofillNote.tone === "bad" ? "planner-error" : "dir-autofill-ok small"} role="status">
              {autofillNote.text}
            </p>
          )}
        </div>
        <fieldset disabled={busy || reading}>
          <div className="field-row">
            {field("organisation", "Organisation", { placeholder: "Crisis Skylight", maxLength: 120 })}
            {field("title", "Role", { placeholder: "Kitchen volunteer", maxLength: 120 })}
          </div>
          {field("summary", "One line", { placeholder: "Help cook and serve lunch for members", maxLength: 200 })}
          <div className="field" data-autofilled={marked("causes")}>
            <span className="micro-label">Causes</span>
            <div className="dir-checks">
              {CAUSES.map((c) => (
                <label key={c.key}>
                  <input
                    type="checkbox"
                    checked={form.causes.includes(c.key)}
                    onChange={(e) => set("causes", e.target.checked ? [...form.causes, c.key] : form.causes.filter((k) => k !== c.key))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          <h4 className="micro-label">Signing up</h4>
          <div className="field-row">
            {select("signupMethod", "How", SIGNUP_METHODS)}
            {select("commitment", "Commitment", COMMITMENT_KINDS)}
          </div>
          <div className="field-row">
            {field("signupUrl", "Sign-up link", { placeholder: "https://", type: "url" })}
            {field("signupEmail", "Sign-up email", { placeholder: "volunteer@…", type: "email" })}
          </div>
          {area("signupSteps", "What happens", "Email Sam with your availability. She replies within a week and books a 20-minute induction call", 1000)}

          <h4 className="micro-label">When</h4>
          {field("timeNeeded", "Time needed", { placeholder: "3 hours a week, term time", maxLength: 120 })}
          {form.sessions.map((s, i) => (
            <div key={i} className="dir-session-edit" data-autofilled={marked("sessions")}>
              <select aria-label="Day" value={s.weekday} onChange={(e) => setSession(i, { weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((d, n) => (
                  <option key={d} value={n + 1}>
                    {d}
                  </option>
                ))}
              </select>
              <input type="time" aria-label="Starts" value={s.start} onChange={(e) => setSession(i, { start: e.target.value })} />
              <input type="time" aria-label="Ends" value={s.end} onChange={(e) => setSession(i, { end: e.target.value })} />
              <button
                type="button"
                className="button small ghost"
                aria-label="Remove this session"
                onClick={() => set("sessions", form.sessions.filter((_, j) => j !== i))}
              >
                <X size={14} aria-hidden="true" />
              </button>
              <div className="dir-session-extra">
                <input aria-label="Where, if not the main address" placeholder="Where (optional)" value={s.where} onChange={(e) => setSession(i, { where: e.target.value })} />
                <input aria-label="Note" placeholder="Note, e.g. term time only" value={s.note} onChange={(e) => setSession(i, { note: e.target.value })} />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="button small"
            onClick={() => set("sessions", [...form.sessions, { weekday: 1, start: "10:00", end: "12:00", where: "", note: "" }])}
          >
            <Plus size={14} aria-hidden="true" /> Add a session time
          </button>

          <h4 className="micro-label">Where</h4>
          {field("address", "Address", { placeholder: "66 Commercial St", maxLength: 200 })}
          <div className="field-row">
            {field("postcode", "Postcode", { placeholder: "E1 6LT", maxLength: 10 })}
            {field("nearestStation", "Nearest station", { placeholder: "Aldgate East", maxLength: 80 })}
          </div>
          {form.postcode.trim().length >= 5 && (
            <button type="button" className="button small dir-find-station" onClick={findStation} disabled={findingStation}>
              <Train size={14} aria-hidden="true" /> {findingStation ? "Looking…" : "Find the nearest station"}
            </button>
          )}

          <h4 className="micro-label">What you need</h4>
          <div className="field-row">
            {field("minAge", "Minimum age", { type: "number", hint: "Blank for any age" })}
            {select("dbs", "DBS", DBS_OPTIONS)}
          </div>
          <div className="dir-checks field">
            <label>
              <input type="checkbox" checked={form.remote} onChange={(e) => set("remote", e.target.checked)} /> Can be done remotely
            </label>
            <label>
              <input type="checkbox" checked={form.expensesPaid} onChange={(e) => set("expensesPaid", e.target.checked)} /> Expenses paid
            </label>
          </div>
          {area("training", "Training", "Food hygiene certificate on your first shift", 500)}
          {area("accessibility", "Accessibility", "Step-free entrance; the kitchen is on the ground floor", 500)}

          <h4 className="micro-label">More</h4>
          {area("description", "About the role", "What a shift is like, who you'll work with…", 4000)}
          <div className="field-row">
            {field("contactName", "Contact name", { maxLength: 120 })}
            {field("contactEmail", "Contact email", { type: "email" })}
          </div>
          {field("orgUrl", "Their website", { placeholder: "https://", type: "url" })}
          <label className="dir-checks field">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Show on the public page
          </label>
        </fieldset>

        {error && (
          <p className="planner-error" role="alert">
            {error}
          </p>
        )}
        <p className="muted small">Saving marks it as checked today</p>
        <div className="modal-actions">
          {entry && (
            <button type="button" className="button danger" onClick={remove} disabled={busy}>
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
          )}
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
