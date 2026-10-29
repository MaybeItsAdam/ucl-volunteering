import { describe, expect, it } from "vitest";
import { planNudges } from "./reminders";

const t = (assigneeId: string, dueOn: string | null, title = "Task") => ({ title, assigneeId, dueOn });

describe("daily nudges", () => {
  const today = "2026-10-28"; // a Wednesday

  it("sends one message a person, leading with overdue", () => {
    const out = planNudges([t("a", "2026-10-20", "Risk assessment"), t("a", "2026-10-29"), t("a", "2026-10-28")], today, false);
    expect(out.size).toBe(1);
    expect(out.get("a")?.body).toBe("1 task overdue, 2 tasks due today or tomorrow — Risk assessment and more");
  });

  it("stays quiet when nothing is close", () => {
    expect(planNudges([t("a", "2026-11-20"), t("b", null)], today, false).size).toBe(0);
  });

  it("gives everyone with open work a count on Mondays", () => {
    const out = planNudges([t("a", "2026-11-01"), t("a", null), t("b", null)], "2026-10-26", true);
    expect(out.get("a")).toEqual({ title: "Your week", body: "2 open tasks, 1 due this week" });
    expect(out.get("b")?.body).toBe("1 open task");
  });
});
