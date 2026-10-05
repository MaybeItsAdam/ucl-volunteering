import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { columns, dueState, matches, nextStatus, readEventFilter } from "./format";

const ME = "me";
const TODAY = "2026-10-05"; // a Monday

function task(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36),
    board: "events",
    title: "t",
    notes: null,
    status: "backlog",
    assigneeId: "them",
    dueOn: null,
    eventId: null,
    event: null,
    docUrl: null,
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

  it("never nags about a finished item", () => {
    const finished = task({ dueOn: "2026-09-01", status: "approved", board: "documents", completedAt: "2026-09-02T00:00:00.000Z" });
    expect(dueState(finished, TODAY)?.tone).toBe("neutral");
  });
});

describe("readEventFilter", () => {
  const isId = (v: string) => v.startsWith("e");

  it("reads actions (and the old 'none'), an event, or everything", () => {
    expect(readEventFilter("actions", isId)).toBe("actions");
    expect(readEventFilter("none", isId)).toBe("actions");
    expect(readEventFilter("e1", isId)).toBe("e1");
    expect(readEventFilter("x1", isId)).toBe("all");
    expect(readEventFilter(undefined, isId)).toBe("all");
  });
});

describe("matches", () => {
  const mineForEvent = task({ assigneeId: ME, eventId: "e1" });
  const theirAction = task({ assigneeId: "them" });

  it("filters by assignee, and by event or actions", () => {
    expect(matches(mineForEvent, { mine: false, event: "all" }, ME)).toBe(true);
    expect(matches(theirAction, { mine: true, event: "all" }, ME)).toBe(false);
    expect(matches(mineForEvent, { mine: true, event: "e1" }, ME)).toBe(true);
    expect(matches(mineForEvent, { mine: false, event: "e2" }, ME)).toBe(false);
    expect(matches(mineForEvent, { mine: false, event: "actions" }, ME)).toBe(false);
    expect(matches(theirAction, { mine: false, event: "actions" }, ME)).toBe(true);
  });
});

describe("columns", () => {
  it("sorts open columns by due date, undated last, and the last by most recently finished", () => {
    const a = task({ id: "a", dueOn: "2026-10-10" });
    const b = task({ id: "b" });
    const c = task({ id: "c", dueOn: "2026-10-06" });
    const d = task({ id: "d", status: "done", completedAt: "2026-10-01T00:00:00.000Z" });
    const e = task({ id: "e", status: "done", completedAt: "2026-10-03T00:00:00.000Z" });
    const f = task({ id: "f", status: "ready_to_post" });
    const g = task({ id: "g", board: "documents", status: "drafting" });
    const board = columns("events", [a, b, c, d, e, f, g]);
    expect(Object.keys(board)).toEqual(["backlog", "planned", "ready_to_post", "content", "done"]);
    expect(board.backlog.map((t) => t.id)).toEqual(["c", "a", "b"]);
    expect(board.ready_to_post.map((t) => t.id)).toEqual(["f"]);
    expect(board.done.map((t) => t.id)).toEqual(["e", "d"]);
    expect(columns("documents", [a, g]).drafting.map((t) => t.id)).toEqual(["g"]);
  });
});

describe("nextStatus", () => {
  it("steps along the board and stops at the end", () => {
    expect(nextStatus("events", "backlog")).toBe("planned");
    expect(nextStatus("events", "ready_to_post")).toBe("content");
    expect(nextStatus("events", "done")).toBeNull();
    expect(nextStatus("documents", "backlog")).toBe("drafting");
    expect(nextStatus("documents", "submitted")).toBe("approved");
    expect(nextStatus("documents", "approved")).toBeNull();
  });
});
