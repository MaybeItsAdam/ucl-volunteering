import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can, profileOf } from "@/lib/access";
import { getEvent, listCommittee } from "@/lib/plan";
import { londonDayKey, mondayOf } from "@/lib/planTime";
import { requireCapability } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { CommitteeMember, PlanEvent } from "@/lib/types";
import { EventDetail } from "@/components/plan/EventDetail";
import { PlanSubnav } from "@/components/plan/PlanSubnav";

type Params = Promise<{ id: string }>;

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
          <p>Events live in the database; set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to see them</p>
        </div>
      </section>
    );
  }

  let loaded: { event: PlanEvent; committee: CommitteeMember[] } | null = null;
  try {
    const [event, committee] = await Promise.all([getEvent(id), listCommittee()]);
    if (event) loaded = { event, committee };
  } catch (error) {
    return (
      <section className="page narrow plan-page">
        <PlanSubnav active="week" />
        <div className="notice bad" role="alert">
          <strong>The event couldn&apos;t be loaded</strong>
          <p>{error instanceof Error ? error.message : "Something went wrong"}</p>
        </div>
      </section>
    );
  }
  if (!loaded) notFound();
  const { event, committee } = loaded;

  const week = mondayOf(londonDayKey(new Date(event.startsAt)));
  return (
    <section className="page narrow plan-page">
      <PlanSubnav active="week" week={week} />
      <Link href={`/portal/calendar?week=${week}`} className="plan-back">
        <ChevronLeft size={16} aria-hidden="true" />
        Back to the week
      </Link>
      <EventDetail
        event={event}
        committee={committee}
        myId={member.id}
        canEdit={can(profileOf(member), "edit_plan")}
        backHref={`/portal/calendar?week=${week}`}
      />
    </section>
  );
}
