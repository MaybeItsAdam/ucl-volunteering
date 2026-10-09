import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({}) }));

const { cleanLabel, parseFeedLink } = await import("./communityFeeds");
const TOOLBOX = "https://www.adamscampustoolbox.org.uk";

describe("parseFeedLink", () => {
  it("takes webcal links as https", () => {
    expect(parseFeedLink("webcal://calendar.google.com/calendar/ical/x/public/basic.ics", TOOLBOX)).toEqual({
      kind: "ical",
      url: "https://calendar.google.com/calendar/ical/x/public/basic.ics",
    });
  });

  it("recognises a Toolbox society by page or by feed", () => {
    expect(parseFeedLink(`${TOOLBOX}/societies/org_soc_un1nre7dp`, TOOLBOX)).toEqual({ kind: "toolbox", organiserId: "org_soc_un1nre7dp" });
    expect(parseFeedLink("https://adamscampustoolbox.org.uk/api/organiser/org_soc_un1nre7dp/ical", TOOLBOX)).toEqual({
      kind: "toolbox",
      organiserId: "org_soc_un1nre7dp",
    });
  });

  it("refuses what isn't a public web link", () => {
    expect(parseFeedLink("not a link", TOOLBOX)).toHaveProperty("error");
    expect(parseFeedLink("ftp://example.org/cal.ics", TOOLBOX)).toHaveProperty("error");
    expect(parseFeedLink("http://localhost:3000/cal.ics", TOOLBOX)).toHaveProperty("error");
    expect(parseFeedLink("http://169.254.169.254/latest", TOOLBOX)).toHaveProperty("error");
    expect(parseFeedLink("http://[::1]/cal.ics", TOOLBOX)).toHaveProperty("error");
  });
});

describe("cleanLabel", () => {
  it("trims, collapses and caps", () => {
    expect(cleanLabel("  Bentham's   Farm ")).toBe("Bentham's Farm");
    expect(cleanLabel("   ")).toBeNull();
    expect(cleanLabel(3)).toBeNull();
    expect(cleanLabel("x".repeat(100))).toHaveLength(80);
  });
});
