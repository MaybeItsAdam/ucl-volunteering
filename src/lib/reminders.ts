import { shiftDayKey } from "@/lib/planTime";

/**
 * The daily nudge to each committee member about their planner items: one
 * notification a person, never one per task. Pure; the cron route loads the
 * items and sends what this decides.
 *
 * Overdue and due today/tomorrow are worth interrupting for. On Mondays a
 * member with anything open also gets the week's count, so a quiet board still
 * gets a look.
 */

export interface OpenTask {
  title: string;
  assigneeId: string;
  /** A London day, YYYY-MM-DD, or null. */
  dueOn: string | null;
}

export interface Nudge {
  title: string;
  body: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What to tell each member, keyed by member id. Members with nothing to hear aren't in it. */
export function planNudges(tasks: OpenTask[], today: string, isMonday: boolean): Map<string, Nudge> {
  const tomorrow = shiftDayKey(today, 1);
  const weekEnd = shiftDayKey(today, 6);
  const byMember = new Map<string, OpenTask[]>();
  for (const t of tasks) byMember.set(t.assigneeId, [...(byMember.get(t.assigneeId) ?? []), t]);

  const out = new Map<string, Nudge>();
  for (const [member, mine] of byMember) {
    const overdue = mine.filter((t) => t.dueOn && t.dueOn < today);
    const soon = mine.filter((t) => t.dueOn && (t.dueOn === today || t.dueOn === tomorrow));
    const thisWeek = mine.filter((t) => t.dueOn && t.dueOn >= today && t.dueOn <= weekEnd);

    const parts: string[] = [];
    if (overdue.length) parts.push(`${plural(overdue.length, "task")} overdue`);
    if (soon.length) parts.push(`${plural(soon.length, "task")} due today or tomorrow`);
    if (parts.length) {
      const first = overdue[0] ?? soon[0];
      out.set(member, { title: "Your tasks need a look", body: `${parts.join(", ")} — ${first.title}${overdue.length + soon.length > 1 ? " and more" : ""}` });
    } else if (isMonday) {
      out.set(member, {
        title: "Your week",
        body: `${plural(mine.length, "open task")}${thisWeek.length ? `, ${thisWeek.length} due this week` : ""}`,
      });
    }
  }
  return out;
}
