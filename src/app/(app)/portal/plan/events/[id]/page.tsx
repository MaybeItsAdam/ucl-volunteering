import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can, profileOf } from "@/lib/access";
import { getEvent, listCommittee, listEvents } from "@/lib/plan";
import { londonDayKey, mondayOf } from "@/lib/planTime";
import { requireCapability } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { CommitteeMember, PlanEvent } from "@/lib/types";
import { EventDetail, type LinkOption } from "@/components/plan/EventDetail";
import { PlanSubnav } from "@/components/plan/PlanSubnav";

type Params = Promise<{ id: string }>;

const DAY_MS = 86_400_000;
/** How far either side of an event to offer events to link it to. */
const LINK_WINDOW_DAYS = 21;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!isSupabaseConfigured()) return { title: "Event" };
  try {
    const event = await getEvent((await params).id);
    return { title: event?.title ?? "Event" };
  } catch {
    return { title: "Event" };
  }
}

export default async function PlanEventPage({ params }: { params: Params }) {
  const member = await requireCapability("view_plan");
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <section className="page narrow plan-page">
        <PlanSubnav active="week" />
        <div className="notice warn">
          <strong>Database not configured</strong>
          <p>Events live in the database; set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to see them.</p>
        </div>
      </section>
    );
  }

  let loaded: { event: PlanEvent; committee: CommitteeMember[]; nearby: PlanEvent[]; linked: PlanEvent | null } | null = null;
  try {
    const event = await getEvent(id);
    if (event) {
      const start = Date.parse(event.startsAt);
      const [committee, nearby, linked] = await Promise.all([
        listCommittee(),
        listEvents(new Date(start - LINK_WINDOW_DAYS * DAY_MS), new Date(start + LINK_WINDOW_DAYS * DAY_MS)),
        event.linkedEventId ? getEvent(event.linkedEventId) : Promise.resolve(null),
      ]);
      loaded = { event, committee, nearby, linked };
    }
  } catch (error) {
    return (
      <section className="page narrow plan-page">
        <PlanSubnav active="week" />
        <div className="notice bad" role="alert">
          <strong>The event couldn&apos;t be loaded</strong>
          <p>{error instanceof Error ? error.message : "Something went wrong."}</p>
        </div>
      </section>
    );
  }
  if (!loaded) notFound();
  const { event, committee, nearby, linked } = loaded;

  const week = mondayOf(londonDayKey(new Date(event.startsAt)));
  // Offer the other source first (a VolSoc event pairs with a Social Impact one), then the rest.
  const options: LinkOption[] = nearby
    .filter((e) => e.id !== event.id)
    .concat(linked && !nearby.some((e) => e.id === linked.id) ? [linked] : [])
    .sort((a, b) => Number(a.source === event.source) - Number(b.source === event.source) || a.startsAt.localeCompare(b.startsAt))
    .map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, source: e.source }));

  return (
    <section className="page narrow plan-page">
      <PlanSubnav active="week" week={week} />
      <Link href={`/portal/plan?week=${week}`} className="plan-back">
        <ChevronLeft size={16} aria-hidden="true" />
        Back to the week
      </Link>
      <EventDetail
        event={event}
        committee={committee}
        linked={linked ? { id: linked.id, title: linked.title, startsAt: linked.startsAt, source: linked.source } : null}
        linkOptions={options}
        myId={member.id}
        canEdit={can(profileOf(member), "edit_plan")}
        backHref={`/portal/plan?week=${week}`}
      />
    </section>
  );
}
