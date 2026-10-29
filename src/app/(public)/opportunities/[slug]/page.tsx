import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail } from "lucide-react";
import { badges, CAUSES, isStale, labelOf, sessionLabel, SIGNUP_METHODS } from "@/lib/directory";
import { getDirectoryEntry } from "@/lib/directoryStore";
import { londonDayKey, shortDate } from "@/lib/planTime";
import "@/components/directory/directory.css";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  const entry = await getDirectoryEntry(slug);
  return entry?.active ? entry : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = await load((await params).slug);
  return entry ? { title: `${entry.title} · ${entry.organisation}`, description: entry.summary } : { title: "Not found" };
}

export default async function OpportunityPage({ params }: Props) {
  const entry = await load((await params).slug);
  if (!entry) notFound();
  const stale = isStale(entry.verifiedOn, londonDayKey(new Date()));
  const mapQuery = encodeURIComponent([entry.address, entry.postcode].filter(Boolean).join(", "));

  return (
    <article className="page narrow dir-detail">
      <Link href="/opportunities" className="dir-back muted small">
        <ArrowLeft size={14} aria-hidden="true" /> All places
      </Link>
      <header className="page-head">
        <span className="micro-label">{entry.organisation}</span>
        <h1>{entry.title}</h1>
      </header>
      <p className="pub-lede">{entry.summary}</p>
      <ul className="dir-badges" aria-label="Key facts">
        {badges(entry).map((b) => (
          <li key={b} className="tag">
            {b}
          </li>
        ))}
      </ul>

      <section className="panel dir-signup" aria-labelledby="signup-title">
        <h2 id="signup-title" className="micro-label">
          How to sign up
        </h2>
        <p className="dir-signup-method">{labelOf(SIGNUP_METHODS, entry.signupMethod)}</p>
        {entry.signupSteps && <p className="dir-pre">{entry.signupSteps}</p>}
        <div className="dir-actions">
          {entry.signupUrl && (
            <a className="button primary" href={entry.signupUrl} target="_blank" rel="noreferrer">
              Sign up <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
          {entry.signupEmail && (
            <a className="button" href={`mailto:${entry.signupEmail}?subject=${encodeURIComponent(`Volunteering: ${entry.title}`)}`}>
              <Mail size={14} aria-hidden="true" /> {entry.signupEmail}
            </a>
          )}
        </div>
      </section>

      {entry.sessions.length > 0 && (
        <section className="panel flush" aria-labelledby="when-title">
          <div className="panel-head">
            <h2 id="when-title" className="micro-label">
              {entry.commitment === "drop_in" ? "Drop-in times" : "When"}
            </h2>
          </div>
          <ul className="rows">
            {entry.sessions.map((s, i) => (
              <li key={i} className="dir-session">
                <strong className="mono">{sessionLabel(s)}</strong>
                {(s.where || s.note) && <span className="muted small">{[s.where, s.note].filter(Boolean).join(" · ")}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel" aria-label="Details">
        <dl className="dir-facts dir-facts-wide">
          {entry.timeNeeded && (
            <div>
              <dt className="micro-label">Time</dt>
              <dd>{entry.timeNeeded}</dd>
            </div>
          )}
          {(entry.address || entry.postcode) && (
            <div>
              <dt className="micro-label">Where</dt>
              <dd>
                <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer">
                  {[entry.address, entry.postcode].filter(Boolean).join(", ")}
                </a>
                {entry.nearestStation && <span className="muted"> · {entry.nearestStation}</span>}
              </dd>
            </div>
          )}
          {entry.training && (
            <div>
              <dt className="micro-label">Training</dt>
              <dd>{entry.training}</dd>
            </div>
          )}
          {entry.accessibility && (
            <div>
              <dt className="micro-label">Accessibility</dt>
              <dd>{entry.accessibility}</dd>
            </div>
          )}
          {entry.causes.length > 0 && (
            <div>
              <dt className="micro-label">Causes</dt>
              <dd>{entry.causes.map((c) => labelOf(CAUSES, c)).join(", ")}</dd>
            </div>
          )}
          {(entry.contactName || entry.contactEmail) && (
            <div>
              <dt className="micro-label">Questions</dt>
              <dd>
                {entry.contactName}
                {entry.contactEmail && (
                  <>
                    {entry.contactName ? " · " : ""}
                    <a href={`mailto:${entry.contactEmail}`}>{entry.contactEmail}</a>
                  </>
                )}
              </dd>
            </div>
          )}
          {entry.orgUrl && (
            <div>
              <dt className="micro-label">Website</dt>
              <dd>
                <a href={entry.orgUrl} target="_blank" rel="noreferrer">
                  {new URL(entry.orgUrl).hostname.replace(/^www\./, "")}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </section>

      {entry.description && (
        <section className="panel" aria-labelledby="about-title">
          <h2 id="about-title" className="micro-label">
            About the role
          </h2>
          <p className="dir-pre">{entry.description}</p>
        </section>
      )}

      <p className={stale ? "notice warn small" : "muted small"}>
        {entry.verifiedOn ? `Last checked by the committee on ${shortDate(entry.verifiedOn)} ${entry.verifiedOn.slice(0, 4)}` : "Not checked yet"}
        {stale && " — details may have changed, so confirm with them before you go"}
      </p>
    </article>
  );
}
