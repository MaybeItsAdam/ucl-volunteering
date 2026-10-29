import type { Metadata } from "next";
import Link from "next/link";
import { DirectoryAdmin } from "@/components/directory/DirectoryAdmin";
import type { DirectoryEntry } from "@/lib/directory";
import { listDirectory } from "@/lib/directoryStore";
import { londonDayKey } from "@/lib/planTime";
import { requireCapability } from "@/lib/session";

export const metadata: Metadata = { title: "Directory" };

export default async function DirectoryAdminPage() {
  await requireCapability("edit_plan");
  let entries: DirectoryEntry[] | null = [];
  try {
    entries = await listDirectory({ activeOnly: false });
  } catch (error) {
    console.error("[portal/directory]", error);
    entries = null;
  }

  return (
    <section className="page narrow">
      <header className="page-head">
        <span className="micro-label">Committee</span>
        <h1>Directory</h1>
      </header>
      <p className="muted small">
        The places on the public <Link href="/opportunities">Volunteering in London</Link> page. Every card shows when to turn up, how to sign
        up and what you need, so fill those in. Once you&apos;ve checked an entry is still right, press &ldquo;Still right&rdquo;
      </p>
      {entries === null ? (
        <div className="notice bad" role="alert">
          <strong>The directory couldn&apos;t be loaded</strong>
          <p>Reload the page to try again</p>
        </div>
      ) : (
        <DirectoryAdmin initial={entries} today={londonDayKey(new Date())} />
      )}
    </section>
  );
}
