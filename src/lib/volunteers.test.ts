import { describe, expect, it } from "vitest";
import { freeSummary, isFreeAt, parseVolunteer, untilLabel } from "./volunteers";

const TODAY = "2026-10-09";
const base = { commitment: "monthly", consent: true };

describe("volunteer sign-ups", () => {
  it("cleans a sign-up, keeping known interests once each in order", () => {
    const parsed = parseVolunteer({ ...base, interests: ["food", 7, "food", "nonsense"], notes: "  " }, TODAY);
    expect(parsed.value).toEqual({
      study: null,
      commitment: "monthly",
      free_times: [],
      available_until: null,
      interests: ["food"],
      notes: null,
    });
  });

  it("joins free times that touch or overlap, and drops ones off the grid", () => {
    const parsed = parseVolunteer(
      {
        ...base,
        free_times: [
          { weekday: 3, startMinute: 600, endMinute: 690 },
          { weekday: 1, startMinute: 540, endMinute: 600 },
          { weekday: 3, startMinute: 660, endMinute: 720 },
          { weekday: 8, startMinute: 600, endMinute: 660 },
          { weekday: 2, startMinute: 605, endMinute: 660 },
          { weekday: 2, startMinute: 700, endMinute: 660 },
          "noon",
        ],
      },
      TODAY,
    );
    expect(parsed.value?.free_times).toEqual([
      { weekday: 1, startMinute: 540, endMinute: 600 },
      { weekday: 3, startMinute: 600, endMinute: 720 },
    ]);
  });

  it("takes an until date from today on, or none", () => {
    expect(parseVolunteer({ ...base, available_until: "2027-06-14" }, TODAY).value?.available_until).toBe("2027-06-14");
    expect(parseVolunteer({ ...base, available_until: TODAY }, TODAY).value?.available_until).toBe(TODAY);
    expect(parseVolunteer({ ...base, available_until: "" }, TODAY).value?.available_until).toBeNull();
    expect(parseVolunteer({ ...base, available_until: "2026-10-08" }, TODAY).error).toMatch(/today/);
    expect(parseVolunteer({ ...base, available_until: "2027-02-30" }, TODAY).error).toMatch(/date/);
  });

  it("ignores a name or email sent with the answers", () => {
    expect(parseVolunteer({ ...base, name: "Someone else", email: "x@ucl.ac.uk" }, TODAY).value).not.toHaveProperty("email");
  });

  it("needs how often and consent", () => {
    expect(parseVolunteer({ ...base, commitment: "daily" }, TODAY).error).toMatch(/how often/);
    expect(parseVolunteer({ ...base, consent: "yes" }, TODAY).error).toMatch(/Tick/);
    expect(parseVolunteer(null, TODAY).error).toBeTruthy();
  });

  it("describes free times and dates", () => {
    const blocks = [
      { weekday: 1, startMinute: 600, endMinute: 780 },
      { weekday: 1, startMinute: 1080, endMinute: 1200 },
      { weekday: 4, startMinute: 480, endMinute: 540 },
    ];
    expect(freeSummary(blocks)).toEqual(["Mon 10:00–13:00, 18:00–20:00", "Thu 08:00–09:00"]);
    expect(isFreeAt(blocks, 1, 750)).toBe(true);
    expect(isFreeAt(blocks, 1, 780)).toBe(false);
    expect(untilLabel("2027-06-14")).toBe("14 Jun 2027");
  });
});
