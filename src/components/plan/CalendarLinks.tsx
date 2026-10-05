"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Rss } from "lucide-react";
import { Sheet } from "@/components/Sheet";

export interface CalendarFeedLink {
  name: string;
  about: string;
  /** What Copy puts on the clipboard. */
  url: string;
  /** Opens Google Calendar ready to add it. */
  googleUrl: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // No clipboard (insecure context, old browser): select-and-copy from the field still works.
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button type="button" className="button small" onClick={copy} aria-live="polite">
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

/** The calendars the committee can subscribe to, each with a link to copy or add to Google. */
export function CalendarLinks({ feeds }: { feeds: CalendarFeedLink[] }) {
  const [open, setOpen] = useState(false);
  if (!feeds.length) return null;
  return (
    <>
      <button type="button" className="button small" onClick={() => setOpen(true)}>
        <Rss size={14} aria-hidden="true" />
        Subscribe
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="calendar-links-title">
          <div className="plan-links">
            <header className="plan-links-head">
              <h3 id="calendar-links-title">Subscribe to the calendars</h3>
              <button type="button" className="button ghost small" onClick={() => setOpen(false)}>
                Done
              </button>
            </header>
            {feeds.map((feed) => (
              <section key={feed.name} className="plan-link">
                <span className="micro-label">{feed.name}</span>
                <p className="muted small">{feed.about}</p>
                <input
                  className="mono plan-link-url"
                  readOnly
                  value={feed.url}
                  aria-label={`${feed.name} link`}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="plan-link-actions">
                  <CopyButton text={feed.url} />
                  <a className="button small ghost" href={feed.googleUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} aria-hidden="true" />
                    Add to Google Calendar
                  </a>
                </div>
              </section>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
