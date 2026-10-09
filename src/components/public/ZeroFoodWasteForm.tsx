"use client";

import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, Minus, Pencil, Plus, X } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import { cleanPeople, COUNTS, MAX_PEOPLE, OUTLETS, type CountKey } from "@/lib/zeroFoodWaste";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; outlet: string; total: number }
  | { kind: "error"; message: string };

/** What the add sheet can log: each food column. Incentives have their own counter. */
type Kind = CountKey;

const KINDS: { key: Kind; label: string; hint: string | null }[] = COUNTS.map((c) => ({
  key: c.key,
  label: c.label,
  hint: c.hint,
}));
const labelOf = (key: Kind) => KINDS.find((k) => k.key === key)?.label ?? key;

const MAX_AMOUNT = 2000;

/** Lower case, accents off, so "cafe" finds "Café" and "obs" finds "North Observatory". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/**
 * Everyone on the shift, as tags: type a name, then Enter or a comma. A name
 * left in the box when the form is sent counts too.
 */
function PeopleInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function commit(text: string) {
    onChange(cleanPeople([...value, ...text.split(",")]));
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "Enter" || event.key === ",") && draft.trim()) {
      event.preventDefault();
      commit(draft);
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="zfw-people" onClick={() => input.current?.focus()}>
      {value.map((name) => (
        <span key={name} className="zfw-person">
          {name}
          <button
            type="button"
            className="zfw-person-remove hit"
            aria-label={`Remove ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.filter((n) => n !== name));
            }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      {value.length < MAX_PEOPLE && (
        <input
          ref={input}
          id="z-people"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={value.length ? "Add someone else" : "Type a name, then Enter"}
          value={draft}
          onChange={(e) => {
            const text = e.target.value;
            // A comma (or a pasted list) finishes the names before it.
            if (text.includes(",")) commit(text);
            else setDraft(text);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && commit(draft)}
        />
      )}
    </div>
  );
}

/**
 * The outlet, typed with suggestions from the round. Anything typed is
 * accepted, so a new outlet needs no code change, but picking from the list
 * keeps the sheet's spelling.
 */
function OutletInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const q = fold(value);
    return q ? OUTLETS.filter((o) => fold(o).includes(q)) : [...OUTLETS];
  }, [value]);
  const exact = OUTLETS.some((o) => fold(o) === fold(value));
  const shown = open && matches.length > 0 && !(exact && matches.length === 1);

  function pick(outlet: string) {
    onChange(outlet);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + matches.length) % Math.max(matches.length, 1));
    } else if (event.key === "Enter" && shown) {
      event.preventDefault();
      pick(matches[Math.min(active, matches.length - 1)]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="zfw-combo">
      <input
        id="z-outlet"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown ? `${listId}-${active}` : undefined}
        autoComplete="off"
        required
        placeholder="Start typing, e.g. Cruciform"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {shown && (
        <ul id={listId} role="listbox" className="zfw-options">
          {matches.map((outlet, i) => (
            <li
              key={outlet}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Before the input's blur closes the list.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(outlet)}
              onMouseEnter={() => setActive(i)}
            >
              {outlet}
            </li>
          ))}
        </ul>
      )}
      {value.trim() && !exact && !shown && <span className="hint">A new outlet, it&apos;ll go in the sheet as typed</span>}
    </div>
  );
}

/**
 * Pick what was collected and how many. Picking something already in the
 * list starts from its amount, so the sheet both adds and corrects.
 */
function AddSheet({
  amounts,
  start,
  onSave,
  onRemove,
  onClose,
}: {
  amounts: Partial<Record<Kind, number>>;
  start: Kind | null;
  onSave: (kind: Kind, amount: number) => void;
  onRemove: (kind: Kind) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind | null>(start);
  const [amount, setAmount] = useState(String(start ? (amounts[start] ?? 1) : 1));
  const n = Math.max(0, Math.min(MAX_AMOUNT, Math.floor(Number(amount) || 0)));
  const editing = kind !== null && amounts[kind] !== undefined;

  function choose(next: Kind) {
    setKind(next);
    setAmount(String(amounts[next] ?? 1));
  }

  return (
    <Sheet onClose={onClose} labelledBy="zfw-add-title">
      <form
        className="zfw-sheet"
        onSubmit={(e) => {
          e.preventDefault();
          if (kind && n > 0) onSave(kind, n);
        }}
      >
        <h2 id="zfw-add-title">{kind && editing ? `Change ${labelOf(kind).toLowerCase()}` : "Add what you collected"}</h2>

        <fieldset>
          <legend className="micro-label">What</legend>
          <div className="zfw-kinds" role="radiogroup">
            {KINDS.map((k) => (
              <label key={k.key} className="zfw-kind" data-picked={kind === k.key ? "" : undefined}>
                <input type="radio" name="zfw-kind" checked={kind === k.key} onChange={() => choose(k.key)} />
                <span className="zfw-kind-text">
                  <span className="zfw-kind-label">{k.label}</span>
                  {k.hint && <span className="zfw-kind-hint">{k.hint}</span>}
                </span>
                {amounts[k.key] !== undefined && <span className="tag">{amounts[k.key]}</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={!kind}>
          <legend className="micro-label">How many</legend>
          <div className="zfw-amount">
            <button
              type="button"
              className="zfw-arrow"
              onClick={() => setAmount(String(Math.max(1, n - 1)))}
              disabled={n <= 1}
              aria-label="One fewer"
            >
              <ChevronDown size={22} aria-hidden="true" />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_AMOUNT}
              step={1}
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="zfw-arrow"
              onClick={() => setAmount(String(Math.min(MAX_AMOUNT, n + 1)))}
              aria-label="One more"
            >
              <ChevronUp size={22} aria-hidden="true" />
            </button>
          </div>
        </fieldset>

        <div className="zfw-sheet-actions">
          {kind && editing && (
            <button type="button" className="button danger" onClick={() => onRemove(kind)}>
              Remove
            </button>
          )}
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={!kind || n < 1}>
            {editing ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * One outlet's collection on one shift. After a save the date and the people
 * on shift stay filled in, since a shift usually covers several outlets.
 */
export function ZeroFoodWasteForm({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [outlet, setOutlet] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Partial<Record<Kind, number>>>({});
  const [incentives, setIncentives] = useState(0);
  const [adding, setAdding] = useState<{ start: Kind | null } | null>(null);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const lines = KINDS.filter((k) => amounts[k.key] !== undefined);
  const total = COUNTS.reduce((sum, c) => sum + (amounts[c.key] ?? 0), 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // A name still in the box counts: the people input adds it on blur, but
    // pressing Go on a phone keyboard can submit first.
    const typed = (document.getElementById("z-people") as HTMLInputElement | null)?.value ?? "";
    const crew = cleanPeople([...people, typed]);
    setPeople(crew);
    const name = OUTLETS.find((o) => fold(o) === fold(outlet)) ?? outlet.trim();
    const counts = Object.fromEntries(COUNTS.map((c) => [c.key, amounts[c.key] ?? 0]));
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/zero-food-waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, outlet: name, people: crew, counts, incentives, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; total?: number };
      if (!res.ok) throw new Error(data.error || "Something went wrong, try again in a minute");
      setStatus({ kind: "done", outlet: name, total: data.total ?? total });
      setOutlet("");
      setAmounts({});
      setIncentives(0);
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
          <div className="field">
            <label htmlFor="z-date">Date</label>
            <input id="z-date" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="z-people">People on shift</label>
            <PeopleInput value={people} onChange={setPeople} />
          </div>
          <div className="field">
            <label htmlFor="z-outlet">Outlet</label>
            <OutletInput value={outlet} onChange={setOutlet} />
          </div>
        </fieldset>

        <fieldset>
          <legend className="micro-label">What you collected</legend>
          {lines.length > 0 && (
            <ul className="zfw-lines">
              {lines.map((k) => (
                <li key={k.key}>
                  <button type="button" className="zfw-line" onClick={() => setAdding({ start: k.key })}>
                    <span className="zfw-line-label">{k.label}</span>
                    <span className="zfw-line-amount mono">{amounts[k.key]}</span>
                    <Pencil size={14} aria-hidden="true" className="dim" />
                    <span className="sr-only">Change</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="zfw-add" onClick={() => setAdding({ start: null })}>
            <Plus size={18} aria-hidden="true" />
            {lines.length ? "Add something else" : "Add what you collected"}
          </button>
          {lines.length > 0 && (
            <p className="pub-total">
              <span className="micro-label">Total</span>
              <span className="mono">{total}</span>
            </p>
          )}
        </fieldset>

        <div className="pub-honeypot" aria-hidden="true">
          <label htmlFor="z-website">Website</label>
          <input id="z-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        <div className="zfw-incentives">
          <label htmlFor="z-incentives" className="zfw-incentives-text">
            <span className="zfw-incentives-label">Incentives</span>
            <span className="zfw-incentives-hint">Given out on the shift, not part of the total</span>
          </label>
          <div className="zfw-stepper">
            <button
              type="button"
              className="zfw-step"
              aria-label="One fewer incentive"
              disabled={incentives <= 0}
              onClick={() => setIncentives((n) => Math.max(0, n - 1))}
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <input
              id="z-incentives"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_AMOUNT}
              step={1}
              value={incentives}
              onChange={(e) => setIncentives(Math.max(0, Math.min(MAX_AMOUNT, Math.floor(Number(e.target.value) || 0))))}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="zfw-step"
              aria-label="One more incentive"
              disabled={incentives >= MAX_AMOUNT}
              onClick={() => setIncentives((n) => Math.min(MAX_AMOUNT, n + 1))}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
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

      {adding && (
        <AddSheet
          amounts={amounts}
          start={adding.start}
          onClose={() => setAdding(null)}
          onSave={(kind, amount) => {
            setAmounts((now) => ({ ...now, [kind]: amount }));
            setAdding(null);
          }}
          onRemove={(kind) => {
            setAmounts((now) => {
              const next = { ...now };
              delete next[kind];
              return next;
            });
            setAdding(null);
          }}
        />
      )}
    </>
  );
}
