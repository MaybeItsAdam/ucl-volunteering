import { describe, expect, it } from "vitest";
import { eventIcs, fold, matchesQuery } from "./calendarSearch";

const event = { title: "Café crawl; fundraiser", location: "Bentham House", description: "Bring cash, please" };

describe("calendar search", () => {
  it("folds accents and case", () => {
    expect(fold("Café ÉTÉ")).toBe("cafe ete");
  });

  it("needs every word, anywhere", () => {
    expect(matchesQuery(event, "Street Aid", "")).toBe(true);
    expect(matchesQuery(event, "Street Aid", "cafe street")).toBe(true);
    expect(matchesQuery(event, "Street Aid", "bentham cash")).toBe(true);
    expect(matchesQuery(event, "Street Aid", "cafe refugees")).toBe(false);
  });
});

describe("eventIcs", () => {
  it("escapes text and writes all-day dates", () => {
    const ics = eventIcs(
      { ...event, id: "e1", startsAt: "2026-10-12T00:00:00Z", endsAt: "2026-10-13T00:00:00Z", allDay: true, url: "https://x.org", cancelled: false },
      "Street Aid",
      { first: "2026-10-12", afterLast: "2026-10-13" },
    );
    expect(ics).toContain("SUMMARY:Café crawl\; fundraiser\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261012\r\n");
    expect(ics).toContain("DESCRIPTION:Run by Street Aid\\n\\nBring cash\\, please\\n\\nhttps://x.org");
  });
});
