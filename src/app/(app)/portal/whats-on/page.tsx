import type { Metadata } from "next";
import { requireCapability } from "@/lib/session";
import { WhatsOnView, type WhatsOnParams } from "@/components/whatson/WhatsOnView";

export const metadata: Metadata = { title: "What's on" };

export default async function WhatsOnPage({ searchParams }: { searchParams: Promise<WhatsOnParams> }) {
  await requireCapability("view_whats_on");
  return (
    <section className="page wo-page">
      <header className="page-head">
        <span className="micro-label">Social impact at UCL</span>
        <h1>What&apos;s on</h1>
      </header>
      <p className="wo-intro muted small">
        Upcoming events from UCL&apos;s social impact societies and UCL Volunteering Society, from Adam&apos;s Campus
        Toolbox — open one to book on the Students&apos; Union site
      </p>
      <WhatsOnView params={await searchParams} basePath="/portal/whats-on" />
    </section>
  );
}
