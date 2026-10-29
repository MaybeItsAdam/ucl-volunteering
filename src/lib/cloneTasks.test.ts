import { describe, expect, it } from "vitest";
import { cloneRows } from "./cloneTasks";

const source = { board: "events" as const, title: "Book minibus", notes: "n", assigneeId: "a", dueOn: "2026-10-17", docUrl: "https://doc" };

describe("copying an event's tasks", () => {
  it("keeps a due date's distance from the event and restarts in Backlog", () => {
    // Event on Sat 24 Oct; task due a week before. New event Sat 14 Nov.
    const [row] = cloneRows([source], "2026-10-24T11:00:00Z", "2026-11-14T11:00:00Z", "ev2", new Set(["a"]), "me");
    expect(row).toMatchObject({ due_on: "2026-11-07", status: "backlog", event_id: "ev2", assignee_member_id: "a", doc_url: null });
  });

  it("hands a leaver's task to whoever is copying, and leaves undated ones undated", () => {
    const [row] = cloneRows([{ ...source, dueOn: null }], "2026-10-24T11:00:00Z", "2026-11-14T11:00:00Z", "ev2", new Set(), "me");
    expect(row.assignee_member_id).toBe("me");
    expect(row.due_on).toBeNull();
  });
});
