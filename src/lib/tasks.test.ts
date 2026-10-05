import { describe, expect, it } from "vitest";
import { completionFor, parseTaskCreate, parseTaskPatch, rowToTask, type TaskRow } from "./tasks";

const MEMBER = "6f1c1c3e-0e0b-4a8e-9a55-0d1f2b3c4d5e";
const EVENT = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const NOW = new Date("2026-10-05T12:00:00Z");
const REQUIRED = { title: "x", assigneeId: MEMBER };

describe("parseTaskCreate", () => {
  it("needs a title and an assignee, and starts in the events board's Backlog", () => {
    expect(parseTaskCreate({ title: "  Book the minibus  ", assigneeId: MEMBER }, NOW)).toEqual({
      ok: true,
      value: { board: "events", status: "backlog", title: "Book the minibus", assignee_member_id: MEMBER },
    });
  });

  it("takes every field, camel or snake case", () => {
    const parsed = parseTaskCreate(
      {
        board: "documents",
        title: "Risk assessment",
        notes: " Use the SU template ",
        assigneeId: MEMBER.toUpperCase(),
        due_on: "2026-10-20",
        eventId: EVENT,
        status: "drafting",
        doc_url: "https://docs.example.com/ra?id=1",
      },
      NOW,
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        board: "documents",
        title: "Risk assessment",
        notes: "Use the SU template",
        assignee_member_id: MEMBER,
        due_on: "2026-10-20",
        event_id: EVENT,
        status: "drafting",
        doc_url: "https://docs.example.com/ra?id=1",
      },
    });
  });

  it("stamps completed_at on an item created in its board's last column", () => {
    const done = parseTaskCreate({ ...REQUIRED, status: "done" }, NOW);
    expect(done.ok && done.value.completed_at).toBe(NOW.toISOString());
    const approved = parseTaskCreate({ ...REQUIRED, board: "documents", status: "approved" }, NOW);
    expect(approved.ok && approved.value.completed_at).toBe(NOW.toISOString());
    const content = parseTaskCreate({ ...REQUIRED, status: "content" }, NOW);
    expect(content.ok && "completed_at" in content.value).toBe(false);
  });

  it("treats empty optional fields as cleared", () => {
    const parsed = parseTaskCreate({ ...REQUIRED, dueOn: "", eventId: null, notes: "   ", docUrl: "" }, NOW);
    expect(parsed).toEqual({
      ok: true,
      value: {
        board: "events",
        status: "backlog",
        title: "x",
        assignee_member_id: MEMBER,
        due_on: null,
        event_id: null,
        notes: null,
        doc_url: null,
      },
    });
  });

  it("refuses an item with no one to own it", () => {
    const error = "assigneeId is required: every item belongs to someone on the committee";
    expect(parseTaskCreate({ title: "x" }, NOW)).toEqual({ ok: false, error });
    expect(parseTaskCreate({ title: "x", assigneeId: null }, NOW)).toEqual({ ok: false, error });
    expect(parseTaskCreate({ title: "x", assigneeId: "" }, NOW)).toEqual({ ok: false, error });
  });

  it("keeps each board to its own columns", () => {
    expect(parseTaskCreate({ ...REQUIRED, board: "documents", status: "ready_to_post" }, NOW)).toEqual({
      ok: false,
      error: "status must be one of backlog, drafting, in_review, submitted, approved on the documents board",
    });
    expect(parseTaskCreate({ ...REQUIRED, status: "approved" }, NOW).ok).toBe(false);
    expect(parseTaskCreate({ ...REQUIRED, board: "documents" }, NOW)).toMatchObject({ ok: true, value: { status: "backlog" } });
  });

  it("refuses bad input", () => {
    expect(parseTaskCreate({ assigneeId: MEMBER }, NOW)).toEqual({ ok: false, error: "title is required" });
    expect(parseTaskCreate({ ...REQUIRED, title: "   " }, NOW)).toEqual({ ok: false, error: "title is required" });
    expect(parseTaskCreate({ ...REQUIRED, title: "x".repeat(201) }, NOW).ok).toBe(false);
    expect(parseTaskCreate({ ...REQUIRED, status: "todo" }, NOW)).toEqual({ ok: false, error: "status isn't a planner column" });
    expect(parseTaskCreate({ ...REQUIRED, status: "toString" }, NOW).ok).toBe(false);
    expect(parseTaskCreate({ ...REQUIRED, board: "socials" }, NOW)).toEqual({ ok: false, error: "board must be one of events, documents" });
    expect(parseTaskCreate({ ...REQUIRED, dueOn: "2026-02-30" }, NOW)).toEqual({ ok: false, error: "dueOn must be a date (YYYY-MM-DD)" });
    expect(parseTaskCreate({ ...REQUIRED, dueOn: "2026-10-20T10:00:00Z" }, NOW).ok).toBe(false);
    expect(parseTaskCreate({ ...REQUIRED, assigneeId: "someone" }, NOW)).toEqual({ ok: false, error: "assigneeId must be an id" });
    expect(parseTaskCreate({ ...REQUIRED, docUrl: "ftp://files.example.com/ra" }, NOW)).toEqual({ ok: false, error: "docUrl must be an http(s) link" });
    expect(parseTaskCreate({ ...REQUIRED, docUrl: "the shared drive" }, NOW)).toEqual({ ok: false, error: "docUrl must be a link" });
    expect(parseTaskCreate({ ...REQUIRED, priority: 1 }, NOW)).toEqual({ ok: false, error: "priority cannot be set" });
    expect(parseTaskCreate({ ...REQUIRED, completed_at: NOW.toISOString() }, NOW)).toEqual({ ok: false, error: "completed_at cannot be set" });
    expect(parseTaskCreate([], NOW)).toEqual({ ok: false, error: "Body must be a JSON object" });
  });
});

describe("parseTaskPatch", () => {
  const backlog = { board: "events", status: "backlog" } as const;

  it("changes only what's sent", () => {
    expect(parseTaskPatch({ dueOn: null }, backlog, NOW)).toEqual({ ok: true, value: { due_on: null } });
  });

  it("refuses an empty change, a blank title or taking the assignee away", () => {
    expect(parseTaskPatch({}, backlog, NOW)).toEqual({ ok: false, error: "Nothing to change" });
    expect(parseTaskPatch({ title: "" }, backlog, NOW)).toEqual({ ok: false, error: "title is required" });
    expect(parseTaskPatch({ assigneeId: null }, backlog, NOW).ok).toBe(false);
  });

  it("checks the status against the item's board", () => {
    expect(parseTaskPatch({ status: "in_review" }, backlog, NOW).ok).toBe(false);
    expect(parseTaskPatch({ status: "in_review" }, { board: "documents", status: "drafting" }, NOW)).toEqual({
      ok: true,
      value: { status: "in_review", completed_at: null },
    });
  });

  it("moves completed_at with the column", () => {
    expect(parseTaskPatch({ status: "done" }, { board: "events", status: "content" }, NOW)).toEqual({
      ok: true,
      value: { status: "done", completed_at: NOW.toISOString() },
    });
    expect(parseTaskPatch({ status: "backlog" }, { board: "events", status: "done" }, NOW)).toEqual({
      ok: true,
      value: { status: "backlog", completed_at: null },
    });
    // Re-saving a finished item as finished keeps the day it was finished.
    expect(parseTaskPatch({ status: "approved", title: "Renamed" }, { board: "documents", status: "approved" }, NOW)).toEqual({
      ok: true,
      value: { status: "approved", title: "Renamed" },
    });
  });

  it("moves an item between boards, keeping Backlog and otherwise starting again", () => {
    expect(parseTaskPatch({ board: "documents" }, backlog, NOW)).toEqual({
      ok: true,
      value: { board: "documents", status: "backlog", completed_at: null },
    });
    expect(parseTaskPatch({ board: "documents" }, { board: "events", status: "done" }, NOW)).toEqual({
      ok: true,
      value: { board: "documents", status: "backlog", completed_at: null },
    });
    expect(parseTaskPatch({ board: "documents", status: "approved" }, { board: "events", status: "done" }, NOW)).toEqual({
      ok: true,
      value: { board: "documents", status: "approved" },
    });
    expect(parseTaskPatch({ board: "documents", status: "planned" }, backlog, NOW).ok).toBe(false);
  });
});

describe("completionFor", () => {
  it("only touches completed_at when the item moves, and stamps it on the last column", () => {
    expect(completionFor({ board: "events", status: "backlog" }, { board: "events", status: "planned" }, NOW)).toEqual({ completed_at: null });
    expect(completionFor({ board: "events", status: "planned" }, { board: "events", status: "planned" }, NOW)).toEqual({});
    expect(completionFor({ board: "documents", status: "submitted" }, { board: "documents", status: "approved" }, NOW)).toEqual({
      completed_at: NOW.toISOString(),
    });
    expect(completionFor({ board: "events", status: "done" }, { board: "documents", status: "approved" }, NOW)).toEqual({});
  });
});

describe("rowToTask", () => {
  const row: TaskRow = {
    id: "1",
    board: "events",
    title: "Print sign-up sheets",
    notes: null,
    status: "done",
    assignee_member_id: MEMBER,
    due_on: "2026-10-20",
    event_id: EVENT,
    doc_url: null,
    created_by: MEMBER,
    created_at: "2026-10-01 09:00:00+00",
    updated_at: "2026-10-02T10:00:00+00:00",
    completed_at: "2026-10-02T10:00:00+00:00",
    event: { id: EVENT, title: "Litter pick", starts_at: "2026-10-24T09:00:00+00:00", status: "confirmed" },
  };

  it("maps columns to the UI shape with Z timestamps", () => {
    expect(rowToTask(row)).toEqual({
      id: "1",
      board: "events",
      title: "Print sign-up sheets",
      notes: null,
      status: "done",
      assigneeId: MEMBER,
      dueOn: "2026-10-20",
      eventId: EVENT,
      event: { id: EVENT, title: "Litter pick", startsAt: "2026-10-24T09:00:00.000Z", status: "confirmed" },
      docUrl: null,
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
