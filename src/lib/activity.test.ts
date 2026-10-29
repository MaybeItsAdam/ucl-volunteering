import { describe, expect, it } from "vitest";
import { describeActivity, taskShareText } from "./activity";

const names: Record<string, string> = { a: "Priya", b: "Sam" };
const nameOf = (id: string) => names[id] ?? "a former member";

describe("task history wording", () => {
  it("says each change in an update on its own line", () => {
    const { lines } = describeActivity("planner.task.update", {
      title: "Minibus",
      from: { status: "backlog", assigneeId: "a", dueOn: null },
      to: { status: "planned", assigneeId: "b", dueOn: "2026-11-05" },
    }, nameOf);
    expect(lines).toEqual(["moved it to Planned", "gave it to Sam", "set the due date to Thu 5 Nov"]);
  });

  it("reports a cleared due date and a former assignee", () => {
    const { lines } = describeActivity("planner.task.update", { from: { dueOn: "2026-11-05" }, to: { dueOn: null, assigneeId: "zzz" } }, nameOf);
    expect(lines).toEqual(["cleared the due date", "gave it to a former member"]);
  });

  it("carries a comment's text", () => {
    expect(describeActivity("planner.task.comment", { body: "Booked!" }, nameOf)).toEqual({ lines: ["commented"], comment: "Booked!" });
  });

  it("shows nothing for actions that aren't about tasks or events", () => {
    expect(describeActivity("auth.sign_in", {}, nameOf).lines).toEqual([]);
  });

  it("groups event time changes into one line", () => {
    const { lines } = describeActivity("plan.event.update", { to: { startsAt: "x", endsAt: "y", status: "confirmed" } }, nameOf);
    expect(lines).toEqual(["changed the time", "set the status to Confirmed"]);
  });
});

describe("share text", () => {
  it("names the task, owner, due date and link", () => {
    const text = taskShareText({ title: "Book the minibus", dueOn: "2026-11-05", board: "events" }, "Priya", "https://x.org/t");
    expect(text).toBe("📋 Book the minibus\nOwner: Priya\nDue: Thu 5 Nov\n\nhttps://x.org/t");
  });
});
