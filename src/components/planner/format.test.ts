import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { columns, dueState, matches } from "./format";

const ME = "me";
const TODAY = "2026-10-05"; // a Monday

function task(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36),
    title: "t",
    notes: null,
    status: "todo",
    assigneeId: null,
    dueOn: null,
    eventId: null,
    event: null,
    createdBy: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    completedAt: null,
    ...over,
  };
}

describe("dueState", () => {
  it("flags overdue, today, tomorrow and the next few days", () => {
    expect(dueState(task({}), TODAY)).toBeNull();
    expect(dueState(task({ dueOn: "2026-10-04" }), TODAY)).toEqual({ label: "Overdue · Sun 4 Oct", tone: "bad" });
    expect(dueState(task({ dueOn: TODAY }), TODAY)).toEqual({ label: "Due today", tone: "warn" });
    expect(dueState(task({ dueOn: "2026-10-06" }), TODAY)).toEqual({ label: "Due tomorrow", tone: "warn" });
    expect(dueState(task({ dueOn: "2026-10-08" }), TODAY)).toEqual({ label: "Due Thu 8 Oct", tone: "warn" });
    expect(dueState(task({ dueOn: "2026-10-09" }), TODAY)).toEqual({ label: "Due Fri 9 Oct", tone: "neutral" });
  });

  it("never nags about a finished task", () => {
    expect(dueState(task({ dueOn: "2026-09-01", status: "done" }), TODAY)?.tone).toBe("neutral");
  });
});

describe("matches", () => {
  const mineForEvent = task({ assigneeId: ME, eventId: "e1" });
  const theirsLoose = task({ assigneeId: "them" });

  it("filters by assignee and event", () => {
    expect(matches(mineForEvent, { mine: false, event: "all" }, ME)).toBe(true);
    expect(matches(theirsLoose, { mine: true, event: "all" }, ME)).toBe(false);
    expect(matches(mineForEvent, { mine: true, event: "e1" }, ME)).toBe(true);
    expect(matches(mineForEvent, { mine: false, event: "e2" }, ME)).toBe(false);
    expect(matches(mineForEvent, { mine: false, event: "none" }, ME)).toBe(false);
    expect(matches(theirsLoose, { mine: false, event: "none" }, ME)).toBe(true);
  });
});

describe("columns", () => {
  it("sorts open tasks by due date, undated last, and done by most recent", () => {
    const a = task({ id: "a", dueOn: "2026-10-10" });
    const b = task({ id: "b" });
    const c = task({ id: "c", dueOn: "2026-10-06" });
    const d = task({ id: "d", status: "done", completedAt: "2026-10-01T00:00:00.000Z" });
    const e = task({ id: "e", status: "done", completedAt: "2026-10-03T00:00:00.000Z" });
    const f = task({ id: "f", status: "doing" });
    const board = columns([a, b, c, d, e, f]);
    expect(board.todo.map((t) => t.id)).toEqual(["c", "a", "b"]);
    expect(board.doing.map((t) => t.id)).toEqual(["f"]);
    expect(board.done.map((t) => t.id)).toEqual(["e", "d"]);
  });
});
