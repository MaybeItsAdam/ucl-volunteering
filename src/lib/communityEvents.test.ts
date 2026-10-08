import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIcal } from "./ical";
import {
  DESCRIPTION_LIMIT,
  hexColour,
  mapWithConcurrency,
  parseSocietyList,
  planSocietyEvents,
  selectCommunitySocieties,
  societyFeedUrl,
  societyPageUrl,
  societyRow,
} from "./communityEvents";

const feed = parseIcal(readFileSync(new URL("./__fixtures__/community-feed.ics", import.meta.url), "utf8"));
const list = JSON.parse(readFileSync(new URL("./__fixtures__/societies.json", import.meta.url), "utf8"));
const NOW = new Date("2026-10-06T12:00:00Z");

describe("Toolbox URLs", () => {
  it("defaults to the live Toolbox and follows the environment", () => {
    expect(societyFeedUrl("org_soc_ugegx4yxz", {})).toBe(
      "https://www.adamscampustoolbox.org.uk/api/organiser/org_soc_ugegx4yxz/ical",
    );
    expect(societyPageUrl("org_x", { TOOLBOX_URL: "http://localhost:3000/" })).toBe("http://localhost:3000/societies/org_x");
  });
});

describe("parseSocietyList", () => {
  const societies = parseSocietyList(list);

  it("keeps entries with an id and a name", () => {
    expect(societies.map((s) => s.id)).toEqual(["org_soc_ugegx4yxz", "org_soc_zdl872hsr", "org_soc_vol_fix", "org_soc_chess"]);
  });

  it("normalises colours and refuses links that aren't the web", () => {
    expect(societies[0]).toMatchObject({ colour: "#e77201", darkColour: "#feb167", logoUrl: "https://studentsunionucl.org/street-aid.jpg" });
    expect(societies[1]).toMatchObject({ colour: null, logoUrl: null, unionUrl: null });
    expect(societies[2].logoUrl).toBeNull();
    expect(societies[3].colour).toBeNull();
  });

  it("accepts a bare array and rejects anything else", () => {
    expect(parseSocietyList([{ id: "a", name: "A" }])).toHaveLength(1);
    expect(() => parseSocietyList({ error: "nope" })).toThrow();
    expect(() => parseSocietyList(null)).toThrow();
  });
});

describe("selectCommunitySocieties", () => {
  it("takes the altruism societies, VolSoc and Student Social Impact, by name", () => {
    const withUssi = [...list.societies, { id: "org_uni_juev5rp0v", name: "UCL Student Social Impact" }, { id: "org_uni_other", name: "Other" }];
    expect(selectCommunitySocieties(parseSocietyList(withUssi)).map((s) => s.id)).toContain("org_uni_juev5rp0v");
    expect(selectCommunitySocieties(parseSocietyList(withUssi)).map((s) => s.id)).not.toContain("org_uni_other");
  });

  it("takes the altruism societies and VolSoc from the fixture, by name", () => {
    expect(selectCommunitySocieties(parseSocietyList(list)).map((s) => s.name)).toEqual([
      "Cancer Charities Alliance Society",
      "Street Aid Society",
      "Volunteering Society",
    ]);
  });

  it("refuses a list with nothing tagged, rather than dropping every society", () => {
    expect(() => selectCommunitySocieties(parseSocietyList([{ id: "org_soc_vol_fix", name: "Volunteering Society" }]))).toThrow(
      /altruism/,
    );
  });

  it("falls back to the light colour in the dark when there is no dark one", () => {
    const row = societyRow({ id: "a", name: "A", logoUrl: null, colour: "#123456", darkColour: null, unionUrl: null, tags: [] });
    expect(row).toMatchObject({ organiser_id: "a", colour: "#123456", dark_colour: "#123456", included: true });
  });
});

describe("planSocietyEvents", () => {
  const rows = planSocietyEvents(feed, NOW);

  it("keeps a day back to two months ahead, one row per UID, soonest first", () => {
    expect(rows.map((r) => r.uid)).toEqual([
      "yesterday@adamscampustoolbox.org.uk",
      "soon@adamscampustoolbox.org.uk",
      "cancelled@adamscampustoolbox.org.uk",
    ]);
    expect(rows[1].title).toBe("Hot Drink Handout Session (longer)");
  });

  it("maps the feed's fields, dropping unsafe links and marking cancellations", () => {
    expect(rows[0]).toMatchObject({
      title: "Hot Drink Handout Session - Taster Outreach",
      starts_at: "2026-10-05T17:00:00.000Z",
      ends_at: "2026-10-05T18:30:00.000Z",
      all_day: false,
      location: "132 Foster Court",
      url: "https://studentsunionucl.org/whats-on/give-it-go/hot-drink-handout-session-taster-outreach?v=97282",
      cancelled: false,
    });
    const soon = planSocietyEvents(feed.filter((e) => e.title === "Hot Drink Handout Session"), NOW)[0];
    expect(soon.url).toBeNull();
    expect(soon.description).toBe("Our regular outreach sessions are back!\nGrab a ticket.");
    expect(rows[2].cancelled).toBe(true);
  });

  it("clips a long description", () => {
    const long = { ...feed[2], description: "x".repeat(DESCRIPTION_LIMIT * 2) };
    const [row] = planSocietyEvents([long], NOW);
    expect(row.description).toHaveLength(DESCRIPTION_LIMIT);
    expect(row.description?.endsWith("…")).toBe(true);
  });

  it("plans nothing for an empty feed, which clears the society's rows", () => {
    expect(planSocietyEvents([], NOW)).toEqual([]);
  });
});

describe("helpers", () => {
  it("hexColour", () => {
    expect(hexColour("#ABCDEF")).toBe("#abcdef");
    expect(hexColour("#abc")).toBeNull();
    expect(hexColour("red; background: url(x)")).toBeNull();
    expect(hexColour(null)).toBeNull();
  });

  it("mapWithConcurrency keeps order and never runs more than the limit", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapWithConcurrency([5, 1, 4, 2, 3, 0], 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, n));
      running -= 1;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 0]);
    expect(peak).toBe(2);
    expect(await mapWithConcurrency([], 4, async (n: number) => n)).toEqual([]);
  });
});
