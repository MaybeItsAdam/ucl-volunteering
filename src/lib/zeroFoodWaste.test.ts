import { describe, expect, it } from "vitest";
import { cleanPeople, OUTLETS, parseZfwEntry, toZfwRow } from "./zeroFoodWaste";

const base = { date: "2026-10-08", outlet: "Cruciform Cafe", people: ["Raem", " chloe "], counts: { main: "10", pastries: 2, fruit: "5" } };

describe("Zero Food Waste entries", () => {
  it("totals the counts and treats blanks as none", () => {
    const parsed = parseZfwEntry(base, "2026-10-08");
    expect(parsed.value?.total).toBe(17);
    expect(parsed.value?.counts).toEqual({ main: 10, pots: 0, pastries: 2, baked: 0, snacks: 0, fruit: 5, others: 0 });
    expect(parsed.value?.incentives).toBeNull();
  });

  it("keeps each person once, as typed", () => {
    expect(cleanPeople([" Raem ", "raem", "", "Chloe  Smith", 3])).toEqual(["Raem", "Chloe Smith"]);
    expect(cleanPeople("Raem, Chloe")).toEqual(["Raem", "Chloe"]);
    expect(OUTLETS).toContain("North Observatory");
  });

  it("refuses a future date, a missing outlet or people, fractions, and an empty shift", () => {
    expect(parseZfwEntry(base, "2026-10-07").error).toMatch(/hasn't happened/);
    expect(parseZfwEntry({ ...base, date: "2026-02-30" }, "2026-10-08").error).toMatch(/date/);
    expect(parseZfwEntry({ ...base, outlet: " " }, "2026-10-08").error).toMatch(/outlet/);
    expect(parseZfwEntry({ ...base, people: [" "] }, "2026-10-08").error).toMatch(/who was on/);
    expect(parseZfwEntry({ ...base, counts: { main: "1.5" } }, "2026-10-08").error).toMatch(/Mains/);
    expect(parseZfwEntry({ ...base, counts: {} }, "2026-10-08").error).toMatch(/at least one/);
    expect(parseZfwEntry({ ...base, incentives: -1 }, "2026-10-08").error).toMatch(/Incentives/);
  });

  it("maps onto the sheet's headings, leaving zero counts blank", () => {
    const row = toZfwRow(parseZfwEntry({ ...base, incentives: "1" }, "2026-10-08").value!);
    expect(row).toEqual({
      date: "2026-10-08",
      values: {
        Outlet: "Cruciform Cafe",
        "Shift Leader": "Raem, chloe",
        Total: 17,
        Main: 10,
        "Fruit pots & Yogurt pots": "",
        "Pastries / Pasties": 2,
        "Other baked goods": "",
        Snacks: "",
        Fruit: 5,
        Others: "",
        Incentives: 1,
      },
    });
  });
});
