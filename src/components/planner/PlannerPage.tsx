import { can, profileOf } from "@/lib/access";
import { getEvent, isUuid, listCommittee, listEvents } from "@/lib/plan";
import { londonDayKey } from "@/lib/planTime";
import { requireCapability } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { DONE_WINDOW_DAYS, listTasks } from "@/lib/tasks";
import type { CommitteeMember, Task, TaskBoard } from "@/lib/types";
import { readEventFilter, type EventOption } from "./format";
import { PlannerBoard } from "./PlannerBoard";
import { PlannerSubnav } from "./PlannerSubnav";
import "./planner.css";

export type PlannerSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const DAY_MS = 86_400_000;
/** Events an item can be linked to: from a week ago to four months ahead. */
const EVENTS_BEHIND_DAYS = 7;
const EVENTS_AHEAD_DAYS = 120;

const HEADINGS: Record<TaskBoard, string> = {
  events: "Event planning",
  documents: "Document prep",
};

/**
 * One of the Planner tab's boards, with its sub-nav. Shared by
 * /portal/planner (events) and /portal/planner/documents. Server Component.
 */
export async function PlannerPage({ board, searchParams }: { board: TaskBoard; searchParams: PlannerSearchParams }) {
  const member = await requireCapability("view_plan");
  const params = await searchParams;
  const now = new Date();
  const today = londonDayKey(now);

  const filter = {
    mine: first(params.mine) === "1",
    event: readEventFilter(first(params.event), isUuid),
  };

  const dbReady = isSupabaseConfigured();
  let tasks: Task[] = [];
  let committee: CommitteeMember[] = [];
  let events: EventOption[] = [];
  let loadError: string | null = null;
  if (dbReady) {
    try {
      const [loadedTasks, loadedCommittee, upcoming, asked] = await Promise.all([
        listTasks({ board, doneSince: new Date(now.getTime() - DONE_WINDOW_DAYS * DAY_MS) }),
        listCommittee(),
        listEvents(new Date(now.getTime() - EVENTS_BEHIND_DAYS * DAY_MS), new Date(now.getTime() + EVENTS_AHEAD_DAYS * DAY_MS)),
        isUuid(filter.event) ? getEvent(filter.event) : Promise.resolve(null),
      ]);
      tasks = loadedTasks;
      committee = loadedCommittee;
      // Cancelled events take no more planning; one asked for by link is kept even if it's out of range.
      const options = upcoming.filter((e) => e.status !== "cancelled");
      if (asked && !options.some((e) => e.id === asked.id)) options.push(asked);
      events = options
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt }));
      if (isUuid(filter.event) && !asked) filter.event = "all";
    } catch (error) {
      loadError = error instanceof Error ? error.message : "The planner couldn't be loaded";
    }
  }

  return (
    <section className="page planner-page">
      <header className="page-head">
        <span className="micro-label">VolSoc planner</span>
        <h1>{HEADINGS[board]}</h1>
      </header>

      <PlannerSubnav active={board} />

      {!dbReady && (
        <div className="notice warn">
          <strong>Database not configured</strong>
          <p>Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to load the planner — the board below is empty until then</p>
        </div>
      )}
      {loadError && (
        <div className="notice bad" role="alert">
          <strong>The planner couldn&apos;t be loaded</strong>
          <p>{loadError}</p>
        </div>
      )}

      <PlannerBoard
        key={board}
        board={board}
        tasks={tasks}
        committee={committee}
        events={events}
        myId={member.id}
        canEdit={dbReady && !loadError && can(profileOf(member), "edit_plan")}
        today={today}
        initialFilter={filter}
        openNew={first(params.new) === "1"}
      />
    </section>
  );
}
