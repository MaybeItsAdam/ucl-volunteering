import { describe, expect, it } from "vitest";
import { fold, matchesQuery } from "./calendarSearch";

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
