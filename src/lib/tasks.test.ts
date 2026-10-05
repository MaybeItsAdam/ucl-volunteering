import { describe, expect, it } from "vitest";
import { completionFor, parseTaskCreate, parseTaskPatch, rowToTask, type TaskRow } from "./tasks";

const MEMBER = "6f1c1c3e-0e0b-4a8e-9a55-0d1f2b3c4d5e";
const EVENT = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const NOW = new Date("2026-10-05T12:00:00Z");

describe("parseTaskCreate", () => {
  it("needs only a title, and starts in To do", () => {
    expect(parseTaskCreate({ title: "  Book the minibus  " }, NOW)).toEqual({
      ok: true,
      value: { status: "todo", title: "Book the minibus" },
    });
  });

  it("takes every field, camel or snake case", () => {
    const parsed = parseTaskCreate(
      { title: "Risk assessment", notes: " Use the SU template ", assigneeId: MEMBER.toUpperCase(), due_on: "2026-10-20", eventId: EVENT, status: "doing" },
      NOW,
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        title: "Risk assessment",
        notes: "Use the SU template",
        assignee_member_id: MEMBER,
        due_on: "2026-10-20",
        event_id: EVENT,
        status: "doing",
      },
    });
  });

  it("stamps completed_at on a task created done", () => {
    const parsed = parseTaskCreate({ title: "Already sorted", status: "done" }, NOW);
    expect(parsed.ok && parsed.value.completed_at).toBe(NOW.toISOString());
  });

  it("treats empty strings as cleared", () => {
    const parsed = parseTaskCreate({ title: "x", assigneeId: "", dueOn: "", eventId: null, notes: "   " }, NOW);
    expect(parsed).toEqual({
      ok: true,
      value: { status: "todo", title: "x", assignee_member_id: null, due_on: null, event_id: null, notes: null },
    });
  });

  it("refuses bad input", () => {
    expect(parseTaskCreate({}, NOW)).toEqual({ ok: false, error: "title is required" });
    expect(parseTaskCreate({ title: "   " }, NOW)).toEqual({ ok: false, error: "title is required" });
    expect(parseTaskCreate({ title: "x".repeat(201) }, NOW).ok).toBe(false);
    expect(parseTaskCreate({ title: "x", status: "blocked" }, NOW)).toEqual({ ok: false, error: "status must be one of todo, doing, done" });
    expect(parseTaskCreate({ title: "x", dueOn: "2026-02-30" }, NOW)).toEqual({ ok: false, error: "dueOn must be a date (YYYY-MM-DD)" });
    expect(parseTaskCreate({ title: "x", dueOn: "2026-10-20T10:00:00Z" }, NOW).ok).toBe(false);
    expect(parseTaskCreate({ title: "x", assigneeId: "someone" }, NOW)).toEqual({ ok: false, error: "assigneeId must be an id" });
    expect(parseTaskCreate({ title: "x", priority: 1 }, NOW)).toEqual({ ok: false, error: "priority cannot be set" });
    expect(parseTaskCreate({ title: "x", completed_at: NOW.toISOString() }, NOW)).toEqual({ ok: false, error: "completed_at cannot be set" });
    expect(parseTaskCreate([], NOW)).toEqual({ ok: false, error: "Body must be a JSON object" });
  });
});

describe("parseTaskPatch", () => {
  it("changes only what's sent", () => {
    expect(parseTaskPatch({ dueOn: null }, "todo", NOW)).toEqual({ ok: true, value: { due_on: null } });
  });

  it("refuses an empty change or a blank title", () => {
    expect(parseTaskPatch({}, "todo", NOW)).toEqual({ ok: false, error: "Nothing to change" });
    expect(parseTaskPatch({ title: "" }, "todo", NOW)).toEqual({ ok: false, error: "title is required" });
  });

  it("moves completed_at with the status", () => {
    expect(parseTaskPatch({ status: "done" }, "doing", NOW)).toEqual({
      ok: true,
      value: { status: "done", completed_at: NOW.toISOString() },
    });
    expect(parseTaskPatch({ status: "todo" }, "done", NOW)).toEqual({ ok: true, value: { status: "todo", completed_at: null } });
    // Re-saving a done task as done keeps the day it was finished.
    expect(parseTaskPatch({ status: "done", title: "Renamed" }, "done", NOW)).toEqual({
      ok: true,
      value: { status: "done", title: "Renamed" },
    });
  });
});

describe("completionFor", () => {
  it("only touches completed_at when the status crosses Done", () => {
    expect(completionFor("todo", "doing", NOW)).toEqual({ completed_at: null });
    expect(completionFor("todo", undefined, NOW)).toEqual({});
    expect(completionFor("doing", "doing", NOW)).toEqual({});
  });
});

describe("rowToTask", () => {
  const row: TaskRow = {
    id: "1",
    title: "Print sign-up sheets",
    notes: null,
    status: "done",
    assignee_member_id: MEMBER,
    due_on: "2026-10-20",
    event_id: EVENT,
    created_by: MEMBER,
    created_at: "2026-10-01 09:00:00+00",
    updated_at: "2026-10-02T10:00:00+00:00",
    completed_at: "2026-10-02T10:00:00+00:00",
    event: { id: EVENT, title: "Litter pick", starts_at: "2026-10-24T09:00:00+00:00", status: "confirmed" },
  };

  it("maps columns to the UI shape with Z timestamps", () => {
    expect(rowToTask(row)).toEqual({
      id: "1",
      title: "Print sign-up sheets",
      notes: null,
      status: "done",
      assigneeId: MEMBER,
      dueOn: "2026-10-20",
      eventId: EVENT,
      event: { id: EVENT, title: "Litter pick", startsAt: "2026-10-24T09:00:00.000Z", status: "confirmed" },
      createdBy: MEMBER,
      createdAt: "2026-10-01T09:00:00.000Z",
      updatedAt: "2026-10-02T10:00:00.000Z",
      completedAt: "2026-10-02T10:00:00.000Z",
    });
  });

  it("copes with no event", () => {
    expect(rowToTask({ ...row, event_id: null, event: null, completed_at: null }).event).toBeNull();
  });
});
