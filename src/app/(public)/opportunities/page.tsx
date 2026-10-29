import type { Metadata } from "next";
import Link from "next/link";
import { DirectoryBrowser } from "@/components/directory/DirectoryBrowser";
import { listDirectory } from "@/lib/directoryStore";
import type { DirectoryEntry } from "@/lib/directory";
import "@/components/directory/directory.css";

export const metadata: Metadata = {
  title: "Volunteering in London",
  description: "Places UCL students can volunteer, with drop-in times, how to sign up, and whether you need a DBS, checked by UCL Volunteering Society",
};

// The committee edits it; a minute-old copy is fine.
export const revalidate = 60;

export default async function OpportunitiesPage() {
  let entries: DirectoryEntry[] = [];
  let failed = false;
  try {
    entries = await listDirectory({ activeOnly: true });
  } catch (error) {
    console.error("[opportunities]", error);
    failed = true;
  }

  return (
    <section className="page narrow">
      <header className="page-head">
        <span className="micro-label">Directory</span>
        <h1>Volunteering in London</h1>
      </header>
      <p className="muted pub-lede">
        Places we know UCL students can volunteer, with when to turn up, how to sign up and what you&apos;ll need. Checked by
        the committee. Know somewhere that should be here? <Link href="/volunteer">Tell us</Link>
      </p>
      {failed ? (
        <div className="notice bad" role="alert">
          <strong>The directory couldn&apos;t be loaded</strong>
          <p>Try again in a minute</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="panel">
          <p className="empty">The directory is being filled in. Check back soon</p>
        </div>
      ) : (
        <DirectoryBrowser entries={entries} />
      )}
    </section>
  );
}
