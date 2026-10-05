import type { GovernanceRole, MemberColour } from "@/lib/access";

// ── Member ──

/** A row of `public.members`, as the server reads it. */
export interface Member {
  id: string;
  toolbox_user_id: string;
  email: string | null;
  name: string;
  /** Null: signed in, but not on the committee. */
  governance_role: GovernanceRole | null;
  /** Set when a principal granted or removed the committee seat by hand. */
  governance_role_locked: boolean;
  colour: MemberColour | null;
  created_at: string;
  last_seen_at: string | null;
}

/** The columns to select for a `Member`. */
export const MEMBER_COLUMNS = "id,toolbox_user_id,email,name,governance_role,governance_role_locked,colour,created_at,last_seen_at";

// ── Plan ──

export const EVENT_SOURCES = ["volsoc", "social_impact", "volsoc_toolbox"] as const;
export const EVENT_CATEGORIES = ["social", "volunteering", "ucl_affiliated", "external"] as const;
export const EVENT_STATUSES = ["provisional", "confirmed", "cancelled"] as const;
export const RESPONSE_KINDS = ["going", "maybe", "no"] as const;

/**
 * `volsoc`: the committee's own, typed into the app. `social_impact` and
 * `volsoc_toolbox`: from the Social Impact and VolSoc organiser feeds on the
 * Toolbox, which own their title, time and place.
 */
export type EventSource = (typeof EVENT_SOURCES)[number];
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type ResponseKind = (typeof RESPONSE_KINDS)[number];

// The brand's four event types. The keys are stored in the database and
// predate the brand: VolSoc-run Volunteering is "Student led", and what UCL
// Student Social Impact runs is "Group led".
export const CATEGORY_LABELS: Record<EventCategory, string> = {
  social: "Socials",
  volunteering: "Student led",
  ucl_affiliated: "Group led",
  external: "External",
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  provisional: "Provisional",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

export const RESPONSE_LABELS: Record<ResponseKind, string> = {
  going: "Going",
  maybe: "Maybe",
  no: "Can't",
};

export interface EventResponse {
  memberId: string;
  response: ResponseKind;
}

/** One row of `public.events` with its responses, as the UI sees it. Times are UTC ISO strings. */
export interface PlanEvent {
  id: string;
  source: EventSource;
  category: EventCategory;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  url: string | null;
  status: EventStatus;
  leadMemberId: string | null;
  linkedEventId: string | null;
  planDocUrl: string | null;
  instagramUrl: string | null;
  recapUrl: string | null;
  notes: string | null;
  targetVolunteers: number | null;
  actualAttendance: number | null;
  /** Set when a Social Impact event left the feed. */
  removedAt: string | null;
  createdBy: string | null;
  updatedAt: string;
  responses: EventResponse[];
}

/** Weekly recurring unavailability: minutes after London midnight, ISO weekday (Mon = 1). */
export interface AvailabilityBlock {
  id: string;
  memberId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  note: string | null;
}

/** A committee member as the planner shows them. */
export interface CommitteeMember {
  id: string;
  name: string;
  colour: MemberColour | null;
}

// ── Planner ──

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
};

/** The event a task is part of, as much of it as the planner shows. */
export interface TaskEvent {
  id: string;
  title: string;
  startsAt: string;
  status: EventStatus;
}

/** One row of `public.tasks`, as the UI sees it. `dueOn` is a London day (YYYY-MM-DD), not an instant. */
export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  assigneeId: string | null;
  dueOn: string | null;
  eventId: string | null;
  event: TaskEvent | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
