import { describe, expect, it } from "vitest";
import {
  isAllowedRedirectFor,
  normaliseCalendarUrl,
  PROVIDERS,
  providerForHost,
  type CalendarKind,
} from "./calendarProviders";

// Made-up links in each provider's real shape. None of these are anyone's calendar.
const GOOGLE_SECRET =
  "https://calendar.google.com/calendar/ical/jane.doe%40gmail.com/private-0123456789abcdef0123456789abcdef/basic.ics";
const GOOGLE_PUBLIC =
  "https://calendar.google.com/calendar/ical/en.uk%23holiday%40group.v.calendar.google.com/public/basic.ics";
const OUTLOOK_365 =
  "https://outlook.office365.com/owa/calendar/0f1e2d3c4b5a69788796a5b4c3d2e1f0@ucl.ac.uk/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567/calendar.ics";
const OUTLOOK_LIVE =
  "https://outlook.live.com/owa/calendar/00000000-0000-0000-0000-000000000000/0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9/cid-0123456789ABCDEF/calendar.ics";
const ICLOUD_TOKEN = "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTA_AbC-dEf";
const ICLOUD = `webcal://p52-caldav.icloud.com/published/2/${ICLOUD_TOKEN}`;

function ok(raw: string, picked?: CalendarKind) {
  const result = normaliseCalendarUrl(raw, picked);
  if (!result.ok) throw new Error(`${raw} → ${result.error}`);
  return result;
}

function refused(raw: string, picked?: CalendarKind): string {
  const result = normaliseCalendarUrl(raw, picked);
  if (result.ok) throw new Error(`${raw} was accepted as ${result.url}`);
  return result.error;
}

describe("normaliseCalendarUrl: Google", () => {
  it("accepts the secret and public iCal addresses as they are", () => {
    expect(ok(GOOGLE_SECRET)).toEqual({ ok: true, url: GOOGLE_SECRET, kind: "google" });
    expect(ok(GOOGLE_PUBLIC)).toEqual({ ok: true, url: GOOGLE_PUBLIC, kind: "google" });
  });

  it("turns webcal, http and a bare host into https", () => {
    const rest = GOOGLE_SECRET.slice("https://".length);
    for (const raw of [`webcal://${rest}`, `webcals://${rest}`, `http://${rest}`, rest, `  <${GOOGLE_SECRET}>  `]) {
      expect(ok(raw).url, raw).toBe(GOOGLE_SECRET);
    }
  });

  it("moves old www.google.com/calendar links to calendar.google.com", () => {
    expect(ok(GOOGLE_SECRET.replace("calendar.google.com", "www.google.com")).url).toBe(GOOGLE_SECRET);
  });

  it("drops a fragment and a query string", () => {
    expect(ok(`${GOOGLE_SECRET}?ctz=Europe/London#x`).url).toBe(GOOGLE_SECRET);
  });

  it("explains the web page and share links", () => {
    expect(refused("https://calendar.google.com/calendar/embed?src=jane.doe%40gmail.com&ctz=Europe%2FLondon")).toBe(
      PROVIDERS.google.pageError,
    );
    expect(refused("https://calendar.google.com/calendar/u/0?cid=amFuZS5kb2VAZ21haWwuY29t")).toMatch(
      /^That's a link to Google Calendar itself/,
    );
    expect(refused("https://calendar.google.com/calendar/r/settings")).toMatch(/^That's a link to Google Calendar itself/);
  });

  it("says when an iCal address is cut short", () => {
    expect(refused("https://calendar.google.com/calendar/ical/jane.doe%40gmail.com/private-0123")).toMatch(/cut short/);
    expect(refused("https://calendar.google.com/calendar/ical/jane.doe%40gmail.com/private-0123456789abcdef0123456789abcdef/basic.html")).toBe(
      PROVIDERS.google.pageError,
    );
  });

  it("refuses other Google paths and hosts", () => {
    refused("https://www.google.com/search?q=calendar");
    refused("https://accounts.google.com/calendar/ical/x/public/basic.ics");
    refused("https://docs.google.com/calendar/ical/jane%40gmail.com/public/basic.ics");
  });
});

describe("normaliseCalendarUrl: Outlook", () => {
  it("accepts Microsoft 365 and Outlook.com published ICS links", () => {
    expect(ok(OUTLOOK_365)).toEqual({ ok: true, url: OUTLOOK_365, kind: "outlook" });
    expect(ok(OUTLOOK_LIVE)).toEqual({ ok: true, url: OUTLOOK_LIVE, kind: "outlook" });
    expect(ok(OUTLOOK_365.replace(/calendar\.ics$/, "reachcalendar.ics")).kind).toBe("outlook");
    expect(ok(OUTLOOK_365.replace("https://", "webcal://")).url).toBe(OUTLOOK_365);
  });

  it("explains the HTML link", () => {
    expect(refused(OUTLOOK_365.replace(/\.ics$/, ".html"))).toBe(PROVIDERS.outlook.pageError);
  });

  it("explains a link to Outlook itself", () => {
    expect(refused("https://outlook.office365.com/calendar/view/week")).toMatch(/^That's a link to Outlook itself/);
    expect(refused("https://outlook.live.com/owa/calendar/calendar.ics")).toMatch(/^That's a link to Outlook itself/);
  });

  it("only takes the two published-calendar hosts", () => {
    expect(refused(OUTLOOK_365.replace("outlook.office365.com", "outlook.office.com"), "outlook")).toMatch(
      /^Only published Outlook calendar links work here/,
    );
    refused(OUTLOOK_365.replace("outlook.office365.com", "outlook.office365.com.example.net"));
    refused(OUTLOOK_365.replace("outlook.office365.com", "evil-outlook.office365.com"));
  });
});

describe("normaliseCalendarUrl: iCloud", () => {
  it("accepts a Public Calendar link from any partition", () => {
    expect(ok(ICLOUD)).toEqual({
      ok: true,
      url: `https://p52-caldav.icloud.com/published/2/${ICLOUD_TOKEN}`,
      kind: "icloud",
    });
    expect(ok(ICLOUD.replace("p52", "p01")).kind).toBe("icloud");
    expect(ok(ICLOUD.replace("p52", "p123")).kind).toBe("icloud");
  });

  it("explains the iCloud web page and private share invitations", () => {
    expect(refused("https://www.icloud.com/calendar/")).toMatch(/^That's iCloud's web page/);
    expect(refused("https://www.icloud.com/calendar/share/#0abcdefABCDEF")).toMatch(/^That's an invitation to share/);
  });

  it("refuses other paths and look-alike hosts", () => {
    expect(refused(ICLOUD.replace("/published/2/", "/published/1/"))).toMatch(/Public Calendar link/);
    refused(ICLOUD.replace("/published/2/", "/12345678/calendars/home/"));
    refused(ICLOUD.replace("p52-caldav", "p52-calendarws"));
    refused(ICLOUD.replace("p52-caldav", "px-caldav"));
    refused(ICLOUD.replace("p52-caldav", "p1234-caldav"));
    refused(ICLOUD.replace("icloud.com", "icloud.com.example.net"));
    refused(ICLOUD.replace("p52-caldav.icloud.com", "p52-caldav.icloud.co"));
  });
});

describe("normaliseCalendarUrl: UCL timetable", () => {
  it("still accepts the Subscribe link, unchanged", () => {
    expect(ok("webcal://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB")).toEqual({
      ok: true,
      url: "https://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB",
      kind: "ucl_timetable",
    });
    expect(ok("ucl.ac.uk/timetable/ics/PONIBF332NKJB").url).toBe("https://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB");
  });

  it("goes by the link, not the picker", () => {
    expect(ok(GOOGLE_SECRET, "ucl_timetable").kind).toBe("google");
    expect(ok("webcal://www.ucl.ac.uk/timetable/ics/PONIBF332NKJB", "icloud").kind).toBe("ucl_timetable");
  });
});

describe("normaliseCalendarUrl: what nobody may link", () => {
  it("gives the picked provider's advice for a link from elsewhere", () => {
    expect(refused("https://example.com/calendar.ics", "google")).toMatch(/^Only Google Calendar/);
    expect(refused("https://example.com/calendar.ics", "outlook")).toMatch(/^Only published Outlook/);
    expect(refused("https://example.com/calendar.ics", "icloud")).toMatch(/^Only iCloud/);
    expect(refused("https://example.com/calendar.ics", "ucl_timetable")).toMatch(/^Only UCL timetable/);
  });

  it("asks for a link when given nothing, and refuses a huge one", () => {
    expect(refused("   ")).toBe("Paste your calendar's link");
    expect(refused("", "ucl_timetable")).toBe("Paste your timetable's Subscribe link");
    expect(refused(`${GOOGLE_SECRET}${"a".repeat(600)}`)).toMatch(/too long/);
  });

  it.each([
    ["userinfo", GOOGLE_SECRET.replace("https://", "https://user:pass@")],
    ["userinfo hiding the real host", "https://calendar.google.com@evil.example/calendar/ical/x/public/basic.ics"],
    ["a port", GOOGLE_SECRET.replace("calendar.google.com", "calendar.google.com:8443")],
    ["a port on iCloud", ICLOUD.replace("icloud.com", "icloud.com:444")],
    ["an IPv4 literal", "https://142.250.180.14/calendar/ical/x/public/basic.ics"],
    ["a metadata address", "http://169.254.169.254/latest/meta-data"],
    ["an IPv6 literal", "https://[::1]/calendar/ical/x/public/basic.ics"],
    ["a decimal IP", "https://2399141134/calendar/ical/x/public/basic.ics"],
    ["localhost", "https://localhost/calendar/ical/x/public/basic.ics"],
    ["a look-alike Google host", "https://calendar.google.com.evil.example/calendar/ical/x/public/basic.ics"],
    ["a Google host with a prefix", "https://evilcalendar.google.com/calendar/ical/x/public/basic.ics"],
    ["unicode look-alike", "https://calendar.gооgle.com/calendar/ical/x/public/basic.ics"],
    ["data:", "data:text/calendar,BEGIN:VCALENDAR"],
    ["javascript:", "javascript:alert(1)"],
    ["file:", "file:///etc/passwd"],
    ["ftp:", "ftp://calendar.google.com/calendar/ical/x/public/basic.ics"],
    ["encoded traversal", "https://calendar.google.com/calendar/ical/%2e%2e%2f%2e%2e/public/basic.ics"],
    ["encoded slash", `https://p52-caldav.icloud.com/published/2/${ICLOUD_TOKEN}%2f..`],
    ["backslash", "https://outlook.office365.com/owa/calendar/a\\..\\b/c/calendar.ics"],
    ["not a link", "my calendar"],
  ])("refuses %s", (_name, raw) => {
    expect(normaliseCalendarUrl(raw).ok).toBe(false);
  });

  it("resolves literal dot segments before checking the path", () => {
    // /calendar/ical/../../search → /search, which is not an iCal address.
    refused("https://calendar.google.com/calendar/ical/../../search/public/basic.ics");
    // Resolving can't smuggle a different provider's path past the rules either.
    refused("https://p52-caldav.icloud.com/published/2/../../.well-known/caldav");
  });
});

describe("providerForHost", () => {
  it("knows each provider's hosts and nothing else", () => {
    expect(providerForHost("calendar.google.com")).toBe("google");
    expect(providerForHost("outlook.live.com")).toBe("outlook");
    expect(providerForHost("p07-caldav.icloud.com")).toBe("icloud");
    expect(providerForHost("timetable.ucl.ac.uk")).toBe("ucl_timetable");
    expect(providerForHost("google.com.evil.example")).toBeNull();
    expect(providerForHost("caldav.icloud.com")).toBeNull();
  });
});

describe("isAllowedRedirectFor", () => {
  const at = (raw: string) => new URL(raw);

  it("keeps each provider's redirects on its own hosts", () => {
    expect(isAllowedRedirectFor("icloud", at("https://p118-caldav.icloud.com/published/2/abc"))).toBe(true);
    expect(isAllowedRedirectFor("outlook", at("https://outlook.office.com/owa/calendar/x/y/calendar.ics"))).toBe(true);
    expect(isAllowedRedirectFor("google", at("https://calendar.google.com/calendar/ical/x/public/basic.ics"))).toBe(true);
  });

  it("refuses a hop to another provider", () => {
    expect(isAllowedRedirectFor("google", at("https://outlook.live.com/owa/calendar/a/b/calendar.ics"))).toBe(false);
    expect(isAllowedRedirectFor("icloud", at("https://calendar.google.com/x"))).toBe(false);
    expect(isAllowedRedirectFor("outlook", at("https://www.ucl.ac.uk/timetable/ics/abcdef"))).toBe(false);
    expect(isAllowedRedirectFor("ucl_timetable", at("https://p01-caldav.icloud.com/published/2/abc"))).toBe(false);
  });

  it("refuses a hop off-provider, to http, a port, userinfo or an address", () => {
    expect(isAllowedRedirectFor("google", at("https://accounts.google.com/ServiceLogin"))).toBe(false);
    expect(isAllowedRedirectFor("google", at("https://evil.example/calendar.ics"))).toBe(false);
    expect(isAllowedRedirectFor("google", at("http://calendar.google.com/calendar/ical/x/public/basic.ics"))).toBe(false);
    expect(isAllowedRedirectFor("icloud", at("https://p01-caldav.icloud.com:8443/published/2/abc"))).toBe(false);
    expect(isAllowedRedirectFor("outlook", at("https://u:p@outlook.live.com/owa/calendar/a/b/calendar.ics"))).toBe(false);
    expect(isAllowedRedirectFor("icloud", at("https://169.254.169.254/latest/meta-data"))).toBe(false);
    expect(isAllowedRedirectFor("icloud", at("https://icloud.com/published/2/abc"))).toBe(false);
  });
});
