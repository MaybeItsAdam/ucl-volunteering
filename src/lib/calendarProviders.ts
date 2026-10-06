/**
 * The calendars a committee member may link as busy time, and what a pasted
 * link for each may be. Pure — no network, no Node built-ins — so the sheet
 * that adds a calendar can import the names and how-to steps too. Fetching is
 * `timetableFeed.ts`; storing is `calendarLinks.ts`.
 *
 * ## Four fixed providers, never "any https .ics"
 *
 * This server fetches every link on a schedule, unattended. An open URL field
 * would be a signed-in, scheduled request forwarder, so each provider is a
 * fixed set of hosts and a fixed path shape, and a redirect may only move
 * within the same provider's hosts. The public-address check in the fetcher
 * is the belt to these braces, for DNS surprises.
 *
 * Link formats (checked October 2026):
 *  - UCL: the timetable's Subscribe button, `webcal://www.ucl.ac.uk/timetable/ics/<token>`.
 *  - Google: Settings → the calendar → Integrate calendar → "Secret address in
 *    iCal format", `https://calendar.google.com/calendar/ical/<id>/private-<hex>/basic.ics`
 *    (or `/public/basic.ics` for a public calendar).
 *  - Outlook / Microsoft 365: Settings → Calendar → Shared calendars → Publish
 *    a calendar → ICS link, `https://outlook.office365.com/owa/calendar/<id>@<domain>/<token>/calendar.ics`
 *    or, for Outlook.com, `https://outlook.live.com/owa/calendar/<guid>/<guid>/cid-<hex>/calendar.ics`.
 *    Some published links end `reachcalendar.ics`; both are accepted.
 *  - iCloud: Calendar → share → Public Calendar, `webcal://p<NN>-caldav.icloud.com/published/2/<token>`.
 *    iCloud answers a published link from another partition with a redirect to
 *    a different `p<NN>-caldav` host, which is why the host is a pattern.
 */

export type CalendarKind = "ucl_timetable" | "google" | "outlook" | "icloud";

export const CALENDAR_KINDS: readonly CalendarKind[] = ["ucl_timetable", "google", "outlook", "icloud"];

/** Most links one member may keep, the UCL timetable included. */
export const MAX_LINKS_PER_MEMBER = 5;

/** Longest name a member may give a link ("Work", "Football club"). Only they see it. */
export const MAX_LABEL_LENGTH = 40;

export type CalendarProvider = {
  kind: CalendarKind;
  /** Picker and list name. */
  name: string;
  /** In "Busy (…)" on the owner's own blocks. */
  short: string;
  /** Whose server, in errors: "Couldn't reach {server}". */
  server: string;
  /** Who stopped recognising a link: "{owner} no longer recognises this link". */
  owner: string;
  /** What to do when a link is revoked or wrong. */
  freshLink: string;
  /** Shown when the link fetched a web page instead of a calendar. */
  pageError: string;
  /** Step by step, for the add form. One line each, no full stops. */
  steps: readonly string[];
  /** A dimmed example in the link field. */
  placeholder: string;
  /** Where the "Open …" button in the add form goes. */
  site: string;
  /** One caveat under the steps, or null. */
  note: string | null;
  /** Whether event titles and rooms may be stored. Only the UCL timetable's are. */
  keepsDetails: boolean;
};

export const PROVIDERS: Record<CalendarKind, CalendarProvider> = {
  ucl_timetable: {
    kind: "ucl_timetable",
    name: "UCL timetable",
    short: "UCL",
    server: "UCL's timetable server",
    owner: "UCL",
    freshLink: "Copy a fresh Subscribe link from your timetable",
    pageError:
      "That looks like the timetable page, not the Subscribe link\nOn timetable.ucl.ac.uk, tap Subscribe and copy the link it gives you",
    steps: [
      "Open your UCL timetable and sign in",
      "Tap Subscribe",
      "Copy the link it gives you and paste it here",
    ],
    placeholder: "webcal://www.ucl.ac.uk/timetable/ics/…",
    site: "https://timetable.ucl.ac.uk",
    note: null,
    keepsDetails: true,
  },
  google: {
    kind: "google",
    name: "Google Calendar",
    short: "Google",
    server: "Google Calendar",
    owner: "Google",
    freshLink: "Copy the secret address again from Google Calendar settings",
    pageError:
      "That's Google's web page for the calendar, not its iCal address\nCopy Secret address in iCal format instead",
    steps: [
      "Open Google Calendar on a computer",
      "Go to Settings, then pick your calendar under Settings for my calendars",
      "Open Integrate calendar",
      "Copy Secret address in iCal format and paste it here",
    ],
    placeholder: "https://calendar.google.com/calendar/ical/…/basic.ics",
    site: "https://calendar.google.com/calendar/r/settings",
    note: "Use the secret address, not the public one, unless your calendar is already public",
    keepsDetails: false,
  },
  outlook: {
    kind: "outlook",
    name: "Outlook or Microsoft 365",
    short: "Outlook",
    server: "Outlook",
    owner: "Microsoft",
    freshLink: "Publish the calendar again in Outlook and copy the new ICS link",
    pageError:
      "That's the HTML link, not the ICS one\nIn Publish a calendar, copy the ICS link instead",
    steps: [
      "Open Outlook on the web and go to Calendar",
      "Go to Settings, then Calendar, then Shared calendars",
      "Under Publish a calendar, choose your calendar and Can view when I'm busy",
      "Select Publish, then copy the ICS link and paste it here",
    ],
    placeholder: "https://outlook.office365.com/owa/calendar/…/calendar.ics",
    site: "https://outlook.office.com/calendar/options/calendar/SharedCalendars",
    note: "If Publish a calendar isn't there, your organisation has turned it off",
    keepsDetails: false,
  },
  icloud: {
    kind: "icloud",
    name: "Apple iCloud",
    short: "iCloud",
    server: "iCloud",
    owner: "Apple",
    freshLink: "Turn Public Calendar on again and copy the new link",
    pageError: "That link opened a web page, not a calendar\nCopy the Public Calendar link instead",
    steps: [
      "Open icloud.com/calendar or the Calendar app",
      "Open the sharing settings for your calendar",
      "Turn on Public Calendar",
      "Copy the link it shows and paste it here",
    ],
    placeholder: "webcal://p01-caldav.icloud.com/published/2/…",
    site: "https://www.icloud.com/calendar/",
    note: "Anyone who has a public calendar's link can open it, so keep the link to yourself",
    keepsDetails: false,
  },
};

export function isCalendarKind(value: unknown): value is CalendarKind {
  return typeof value === "string" && (CALENDAR_KINDS as readonly string[]).includes(value);
}

/** Hosts a pasted UCL link may name. Path rules are in `normaliseTimetableUrl`. */
export const ALLOWED_FEED_HOSTS = ["www.ucl.ac.uk", "timetable.ucl.ac.uk"] as const;

const MAX_URL_LENGTH = 500;

export type NormalisedUrl = { ok: true; url: string } | { ok: false; error: string };
export type NormalisedLink = { ok: true; url: string; kind: CalendarKind } | { ok: false; error: string };

export const PAGE_NOT_LINK_ERROR = PROVIDERS.ucl_timetable.pageError;
const NOT_UCL_ERROR =
  "Only UCL timetable links work here\nIt should start webcal://www.ucl.ac.uk/timetable/ics/";

/** What to say about a link from none of the four, by the provider picked in the form. */
const WRONG_HOST_ERROR: Record<CalendarKind, string> = {
  ucl_timetable: NOT_UCL_ERROR,
  google: "Only Google Calendar iCal addresses work here\nIt should start https://calendar.google.com/calendar/ical/",
  outlook:
    "Only published Outlook calendar links work here\nIt should start https://outlook.office365.com/owa/calendar/ or https://outlook.live.com/owa/calendar/",
  icloud: "Only iCloud public calendar links work here\nIt should start webcal://p…-caldav.icloud.com/published/",
};

/**
 * The shared first half: trim, scheme to https, parse, and refuse userinfo and
 * odd ports. `webcal://` (what every Subscribe button gives) and `http://`
 * become `https://`; a bare host gains a scheme; anything else that is not
 * https after that — `data:`, `javascript:`, `ftp:` — is refused.
 */
function parseLink(raw: string, empty: string): { ok: true; url: URL } | { ok: false; error: string; wrongHost?: true } {
  let text = raw.trim().replace(/^<|>$/g, "");
  if (!text) return { ok: false, error: empty };
  if (text.length > MAX_URL_LENGTH) return { ok: false, error: "That link is too long to be a calendar link" };
  // The URL parser reads a backslash as a slash and spaces as nothing much;
  // no real calendar link has either, so neither is guessed at.
  if (/[\\\s]/.test(text)) return { ok: false, error: "That isn't a link\nCopy it again and paste the whole thing" };

  if (/^webcals?:\/\//i.test(text)) text = text.replace(/^webcals?:\/\//i, "https://");
  else if (/^http:\/\//i.test(text)) text = text.replace(/^http:\/\//i, "https://");
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "That isn't a link\nCopy it again and paste the whole thing" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "", wrongHost: true };
  if (url.username || url.password || (url.port && url.port !== "443")) {
    return { ok: false, error: "", wrongHost: true };
  }
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  url.port = "";
  url.hash = "";
  return { ok: true, url };
}

/**
 * Encoded dots and slashes have no business in any of these paths, and a
 * server that decodes them late could be walked somewhere else. `new URL`
 * already resolves literal `..` segments before the path rules see them.
 */
function hasEncodedTraversal(path: string): boolean {
  return /%2e|%2f|%5c|\\/i.test(path);
}

const UCL_HOSTS = new Set(["www.ucl.ac.uk", "ucl.ac.uk", "timetable.ucl.ac.uk"]);
const GOOGLE_HOSTS = new Set(["calendar.google.com", "www.google.com", "google.com"]);
const OUTLOOK_HOSTS = new Set(["outlook.office365.com", "outlook.live.com"]);
/** Outlook may also answer from here; it is allowed for redirects only, never pasted. */
const OUTLOOK_REDIRECT_HOSTS = new Set([...OUTLOOK_HOSTS, "outlook.office.com"]);
const ICLOUD_FEED_HOST = /^p\d{1,3}-caldav\.icloud\.com$/;
const ICLOUD_WEB_HOSTS = new Set(["icloud.com", "www.icloud.com"]);

/** Which provider a (lower-cased) host belongs to, or null for none of them. */
export function providerForHost(host: string): CalendarKind | null {
  if (UCL_HOSTS.has(host)) return "ucl_timetable";
  if (GOOGLE_HOSTS.has(host)) return "google";
  if (OUTLOOK_HOSTS.has(host) || host === "outlook.office.com") return "outlook";
  if (ICLOUD_FEED_HOST.test(host) || ICLOUD_WEB_HOSTS.has(host)) return "icloud";
  return null;
}

/**
 * A UCL timetable link → the canonical https URL, or what is wrong. Rules
 * unchanged from the timetable-only version: `ucl.ac.uk` gains its `www`, the
 * path must be `/timetable/ics/<token>` there, or name an ics endpoint on
 * timetable.ucl.ac.uk.
 */
export function normaliseTimetableUrl(raw: string): NormalisedUrl {
  const parsed = parseLink(raw, "Paste your timetable's Subscribe link");
  if (!parsed.ok) {
    if (parsed.wrongHost) return { ok: false, error: NOT_UCL_ERROR };
    return {
      ok: false,
      error: parsed.error.startsWith("That isn't a link")
        ? "That isn't a link\nCopy the Subscribe link from your UCL timetable"
        : parsed.error.replace("a calendar link", "a timetable link"),
    };
  }
  const url = parsed.url;
  if (url.hostname === "ucl.ac.uk") url.hostname = "www.ucl.ac.uk";
  const host = url.hostname;

  if (host === "www.ucl.ac.uk") {
    if (/^\/timetable\/ics\/[A-Za-z0-9_-]{6,}\/?$/.test(url.pathname)) return { ok: true, url: url.toString() };
    if (url.pathname.startsWith("/timetable")) return { ok: false, error: PAGE_NOT_LINK_ERROR };
    return { ok: false, error: NOT_UCL_ERROR };
  }
  if (host === "timetable.ucl.ac.uk") {
    // The feed path on this host is not documented; anything that names an
    // ics endpoint is tried, and the fetch's VCALENDAR check is the real test.
    if (/(^|\/)ics(\/|$)|\.ics$/i.test(url.pathname)) return { ok: true, url: url.toString() };
    return { ok: false, error: PAGE_NOT_LINK_ERROR };
  }
  return { ok: false, error: NOT_UCL_ERROR };
}

const GOOGLE_FEED_PATH = /^\/calendar\/ical\/[A-Za-z0-9._%+-]{3,200}\/(public|private-[A-Za-z0-9]{16,64})\/basic\.ics$/;

function normaliseGoogle(url: URL): NormalisedLink {
  // Old links say www.google.com/calendar/ical/…, which Google still answers
  // by sending you to calendar.google.com; store where it ends up.
  if (url.hostname !== "calendar.google.com") {
    if (!url.pathname.startsWith("/calendar/")) return { ok: false, error: WRONG_HOST_ERROR.google };
    url.hostname = "calendar.google.com";
  }
  if (GOOGLE_FEED_PATH.test(url.pathname)) {
    url.search = "";
    return { ok: true, url: url.toString(), kind: "google" };
  }
  if (/^\/calendar\/(embed|htmlembed)\b/.test(url.pathname) || /\/basic\.html$/.test(url.pathname)) {
    return { ok: false, error: PROVIDERS.google.pageError };
  }
  if (url.pathname.startsWith("/calendar/ical/")) {
    return {
      ok: false,
      error: "That iCal address looks cut short\nCopy the whole Secret address in iCal format, ending basic.ics",
    };
  }
  return {
    ok: false,
    error:
      "That's a link to Google Calendar itself, not your calendar's iCal address\nCopy Secret address in iCal format from your calendar's settings",
  };
}

const OUTLOOK_FEED_PATH = /^\/owa\/calendar\/(?:[A-Za-z0-9@._%-]{1,120}\/){2,4}(?:reach)?calendar\.ics$/;

function normaliseOutlook(url: URL): NormalisedLink {
  if (!OUTLOOK_HOSTS.has(url.hostname)) return { ok: false, error: WRONG_HOST_ERROR.outlook };
  if (OUTLOOK_FEED_PATH.test(url.pathname)) {
    url.search = "";
    return { ok: true, url: url.toString(), kind: "outlook" };
  }
  if (/^\/owa\/calendar\/.+\.html$/.test(url.pathname)) return { ok: false, error: PROVIDERS.outlook.pageError };
  return {
    ok: false,
    error:
      "That's a link to Outlook itself, not a published calendar\nIn Settings, Shared calendars, publish your calendar and copy the ICS link",
  };
}

const ICLOUD_FEED_PATH = /^\/published\/2\/[A-Za-z0-9_-]{20,400}$/;

function normaliseIcloud(url: URL): NormalisedLink {
  if (ICLOUD_WEB_HOSTS.has(url.hostname)) {
    return {
      ok: false,
      error: url.pathname.startsWith("/calendar/share")
        ? "That's an invitation to share, not a public link\nTurn on Public Calendar and copy that link instead"
        : "That's iCloud's web page, not a calendar link\nTurn on Public Calendar and copy the link it shows",
    };
  }
  if (ICLOUD_FEED_PATH.test(url.pathname)) {
    url.search = "";
    return { ok: true, url: url.toString(), kind: "icloud" };
  }
  return {
    ok: false,
    error: "That doesn't look like a Public Calendar link\nIt should contain /published/2/ followed by a long code",
  };
}

/**
 * Whatever was pasted → the canonical https URL and its provider, or what is
 * wrong with it.
 *
 * The provider comes from the link's host, not the picker: paste an Outlook
 * link with Google picked and it is still an Outlook link. `picked` only
 * chooses which advice to give when the link is from none of the four.
 */
export function normaliseCalendarUrl(raw: string, picked: CalendarKind = "google"): NormalisedLink {
  const parsed = parseLink(
    raw,
    picked === "ucl_timetable" ? "Paste your timetable's Subscribe link" : "Paste your calendar's link",
  );
  if (!parsed.ok) return { ok: false, error: parsed.wrongHost ? WRONG_HOST_ERROR[picked] : parsed.error };
  const url = parsed.url;
  const kind = providerForHost(url.hostname);
  if (!kind) return { ok: false, error: WRONG_HOST_ERROR[picked] };
  if (hasEncodedTraversal(url.pathname)) return { ok: false, error: WRONG_HOST_ERROR[kind] };

  switch (kind) {
    case "ucl_timetable": {
      const ucl = normaliseTimetableUrl(raw);
      return ucl.ok ? { ...ucl, kind } : ucl;
    }
    case "google":
      return normaliseGoogle(url);
    case "outlook":
      return normaliseOutlook(url);
    case "icloud":
      return normaliseIcloud(url);
  }
}

/** Whether a UCL redirect target is acceptable: https, and a ucl.ac.uk host. */
export function isAllowedRedirect(target: URL): boolean {
  return isAllowedRedirectFor("ucl_timetable", target);
}

/**
 * Whether a fetch may go to `target` for a link of `kind`: https on the
 * default port, no userinfo, and one of that provider's own hosts. The path
 * is not re-checked on a hop — the provider chose it — but the host is, so a
 * redirect can never leave the provider.
 */
export function isAllowedRedirectFor(kind: CalendarKind, target: URL): boolean {
  if (target.protocol !== "https:") return false;
  if (target.username || target.password) return false;
  if (target.port && target.port !== "443") return false;
  const host = target.hostname.toLowerCase().replace(/\.$/, "");
  switch (kind) {
    case "ucl_timetable":
      return host === "ucl.ac.uk" || host.endsWith(".ucl.ac.uk");
    case "google":
      return GOOGLE_HOSTS.has(host);
    case "outlook":
      return OUTLOOK_REDIRECT_HOSTS.has(host);
    case "icloud":
      return ICLOUD_FEED_HOST.test(host);
  }
}
