import { describe, expect, it } from "vitest";
import { parseVolunteer, slotLabel } from "./volunteers";

const base = { commitment: "monthly", consent: true };

describe("volunteer sign-ups", () => {
  it("cleans a sign-up, keeping known options once each in order", () => {
    const parsed = parseVolunteer({
      ...base,
      periods: ["summer", "term1", "term1", "nonsense"],
      slots: ["wed_pm", "mon_am", "mon_midnight"],
      interests: ["food", 7],
      notes: "  ",
    });
    expect(parsed.value).toEqual({
      study: null,
      commitment: "monthly",
      periods: ["term1", "summer"],
      slots: ["mon_am", "wed_pm"],
      interests: ["food"],
      notes: null,
    });
  });

  it("ignores a name or email sent with the answers", () => {
    expect(parseVolunteer({ ...base, name: "Someone else", email: "x@ucl.ac.uk" }).value).not.toHaveProperty("email");
  });

  it("needs how often and consent", () => {
    expect(parseVolunteer({ ...base, commitment: "daily" }).error).toMatch(/how often/);
    expect(parseVolunteer({ ...base, consent: "yes" }).error).toMatch(/Tick/);
    expect(parseVolunteer(null).error).toBeTruthy();
  });

  it("labels a slot", () => {
    expect(slotLabel("thu_eve")).toBe("Thu evening");
  });
});
