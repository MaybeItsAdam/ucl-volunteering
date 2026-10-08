import type { Metadata } from "next";
import { CalendarLinks } from "@/components/plan/CalendarLinks";
import { googleAddUrl } from "@/components/plan/format";
import { WhatsOnView, type WhatsOnParams } from "@/components/whatson/WhatsOnView";
import { PUBLIC_CALENDAR_NAME } from "@/lib/publicCalendar";
import "@/components/plan/plan.css";

export const metadata: Metadata = {
  title: "Volunteering calendar",
  description: "Volunteering at UCL in one calendar: VolSoc, Student Social Impact, Street Aid and more",
};

/** What's on, for everyone: the societies' events, and one feed of them all to subscribe to. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<WhatsOnParams> }) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://uclvolunteering.org").replace(/\/+$/, "");
  const feedUrl = `${appUrl}/calendar.ics`;

  return (
    <section className="page wo-page">
      <header className="page-head">
        <span className="micro-label">Volunteering at UCL</span>
        <h1>Calendar</h1>
        <div className="page-actions">
          <CalendarLinks
            feeds={[
              {
                name: PUBLIC_CALENDAR_NAME,
                about: "Every event on this page, kept up to date in your own calendar",
                url: feedUrl,
                googleUrl: googleAddUrl(feedUrl),
              },
            ]}
          />
        </div>
      </header>
      <p className="wo-intro muted small">
        Upcoming events from VolSoc, UCL Student Social Impact and UCL&apos;s social impact societies, like Street Aid,
        Red Cross and Student Action for Refugees — open one to book on the Students&apos; Union site
      </p>
      <WhatsOnView params={await searchParams} basePath="/calendar" />
    </section>
  );
}
