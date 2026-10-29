import { dayLabel } from "@/components/plan/format";
import { STATUS_LABELS, TASK_BOARD_LABELS, TASK_STATUS_LABELS, type EventStatus, type TaskBoard, type TaskStatus } from "@/lib/types";

/**
 * The history on a task or an event, read back from the audit log. This file is
 * the wording: what an audit row (action + metadata) says in plain English.
 * Pure, so the client and the tests can use it; `activityStore.ts` loads rows.
 */

export interface ActivityItem {
  id: number;
  at: string;
  /** Null when the person is gone or the row was written by the system. */
  actor: { id: string; name: string } | null;
  /** What happened, one line per change, with no name in front ("moved it to Done"). */
  lines: string[];
  /** A comment's text. Set only for comments. */
  comment: string | null;
}

type Meta = Record<string, unknown>;

const isObject = (v: unknown): v is Meta => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Fields a task update can change, and how each is said. */
function taskChange(field: string, from: unknown, to: unknown, nameOf: (id: string) => string): string | null {
  switch (field) {
    case "title":
      return `renamed it to “${text(to)}”`;
    case "status":
      return `moved it to ${TASK_STATUS_LABELS[to as TaskStatus] ?? text(to)}`;
    case "board":
      return `moved it to the ${TASK_BOARD_LABELS[to as TaskBoard] ?? text(to)} board`;
    case "assigneeId":
      return `gave it to ${nameOf(text(to))}`;
    case "dueOn":
      return to ? `set the due date to ${dayLabel(text(to))}` : "cleared the due date";
    case "eventId":
      return to ? "linked it to an event" : "unlinked it from its event";
    case "docUrl":
      return to ? "changed the document link" : "removed the document link";
    case "notes":
      return "edited the notes";
    default:
      return null;
  }
}

const EVENT_FIELDS: Record<string, string> = {
  title: "the title",
  category: "the type",
  status: "the status",
  startsAt: "the time",
  endsAt: "the time",
  allDay: "the time",
  location: "the place",
  description: "the description",
  url: "the link",
  leadMemberId: "the lead",
  planDocUrl: "the plan link",
  instagramUrl: "the Instagram link",
  recapUrl: "the recap link",
  notes: "the notes",
  targetVolunteers: "the volunteer target",
  actualAttendance: "the attendance",
};

/** The lines an audit row adds to a history, or none if it isn't one worth showing. */
export function describeActivity(action: string, metadata: unknown, nameOf: (id: string) => string): { lines: string[]; comment: string | null } {
  const m: Meta = isObject(metadata) ? metadata : {};
  const none = { lines: [], comment: null };
  switch (action) {
    case "planner.task.create":
      return { lines: [`added “${text(m.title)}”`], comment: null };
    case "planner.task.delete":
      return { lines: [`deleted “${text(m.title)}”`], comment: null };
    case "planner.task.comment":
      return { lines: ["commented"], comment: text(m.body) || null };
    case "planner.task.reassign":
      return { lines: [`handed it over from ${nameOf(text(m.fromId))} to ${nameOf(text(m.toId))}`], comment: null };
    case "planner.task.update": {
      const from = isObject(m.from) ? m.from : {};
      const to = isObject(m.to) ? m.to : {};
      const lines = Object.keys(to)
        .map((field) => taskChange(field, from[field], to[field], nameOf))
        .filter((line): line is string => line !== null);
      return { lines, comment: null };
    }
    case "plan.event.create":
      return { lines: ["created the event"], comment: null };
    case "plan.event.delete":
      return { lines: ["deleted the event"], comment: null };
    case "plan.response.set":
      return { lines: [`replied ${text(m.response) === "no" ? "can't make it" : text(m.response) || "to the event"}`], comment: null };
    case "plan.event.update": {
      const to = isObject(m.to) ? m.to : {};
      const lines: string[] = [];
      for (const field of Object.keys(to)) {
        if (field === "status") lines.push(`set the status to ${STATUS_LABELS[to.status as EventStatus] ?? text(to.status)}`);
        else if (field === "leadMemberId") lines.push(to.leadMemberId ? `made ${nameOf(text(to.leadMemberId))} the lead` : "cleared the lead");
        else if (EVENT_FIELDS[field]) lines.push(`changed ${EVENT_FIELDS[field]}`);
      }
      return { lines: [...new Set(lines)], comment: null };
    }
    default:
      return none;
  }
}

/** A task's WhatsApp message: what it is, who has it, when it's due, and a link to it. */
export function taskShareText(
  task: { title: string; dueOn: string | null; board: TaskBoard },
  owner: string | null,
  link: string,
): string {
  const lines = [`📋 ${task.title}`];
  if (owner) lines.push(`Owner: ${owner}`);
  if (task.dueOn) lines.push(`Due: ${dayLabel(task.dueOn)}`);
  lines.push("", link);
  return lines.join("\n");
}
