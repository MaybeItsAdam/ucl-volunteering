import { lookup } from "dns/promises";
import { isReservedAddress } from "@/lib/reservedAddress";

/**
 * One public web page, read as text: what the directory's autofill reads when
 * the committee pastes an organisation's volunteering page.
 *
 * The link is typed by a committee member, so it's treated like the timetable
 * feeds: http(s) only, every hop's addresses public (no loopback, private or
 * metadata space), redirects followed by hand (at most three) so each is
 * re-checked, the body capped at 2 MB and the whole fetch at 15 seconds.
 */

export class PageError extends Error {}

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

export interface PageDeps {
  fetchImpl?: typeof fetch;
  lookupImpl?: (host: string) => Promise<{ address: string }[]>;
}

async function assertPublic(url: URL, lookupImpl: NonNullable<PageDeps["lookupImpl"]>): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new PageError("Links must start with https://");
  let addresses: { address: string }[];
  try {
    addresses = await lookupImpl(url.hostname);
  } catch {
    throw new PageError(`Couldn't find ${url.hostname}`);
  }
  if (addresses.length === 0 || addresses.some((a) => isReservedAddress(a.address))) throw new PageError(`Couldn't reach ${url.hostname}`);
}

async function readCapped(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length") ?? "0") > MAX_BYTES) throw new PageError("That page is too big to read");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new PageError("That page is too big to read");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The page's HTML and the URL it finally came from. */
export async function fetchPublicPage(link: string, deps: PageDeps = {}): Promise<{ html: string; url: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookupImpl = deps.lookupImpl ?? ((host: string) => lookup(host, { all: true }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current: URL;
    try {
      current = new URL(link);
    } catch {
      throw new PageError("That isn't a link");
    }
    for (let hop = 0; ; hop++) {
      await assertPublic(current, lookupImpl);
      let response: Response;
      try {
        response = await fetchImpl(current.toString(), {
          redirect: "manual",
          signal: controller.signal,
          cache: "no-store",
          headers: {
            Accept: "text/html, text/plain;q=0.9",
            "User-Agent": "Mozilla/5.0 (compatible; UCLVolunteeringSociety/1.0; +https://uclvolunteering.org)",
          },
        });
      } catch {
        throw new PageError(controller.signal.aborted ? `${current.hostname} took too long to answer` : `Couldn't reach ${current.hostname}`);
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop >= MAX_REDIRECTS) throw new PageError(`${current.hostname} sent us in circles`);
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new PageError(`${current.hostname} answered ${response.status}${response.status === 403 ? ": it may block automated reading, so paste the text instead" : ""}`);
      const type = response.headers.get("content-type") ?? "";
      if (type && !/text\/(html|plain)|xhtml/.test(type)) throw new PageError("That link isn't a web page");
      return { html: await readCapped(response), url: current.toString() };
    }
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", pound: "£", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * Readable text from HTML, for a model to read: scripts, styles and page
 * furniture dropped, block elements as line breaks, and every link kept as
 * "text (url)" (absolute) so a sign-up form or email address survives.
 */
export function htmlToText(html: string, baseUrl: string, limit = 40_000): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer)\b[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    const label = inner.replace(/<[^>]+>/g, " ").trim();
    let target = decode(href.trim());
    if (/^(javascript|data):/i.test(target) || target.startsWith("#")) return label;
    if (!/^mailto:|^tel:/i.test(target)) {
      try {
        target = new URL(target, baseUrl).toString();
      } catch {
        return label;
      }
    }
    return label ? `${label} (${target})` : `(${target})`;
  });
  s = s
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/?(p|div|section|article|li|ul|ol|tr|table|h[1-6]|dt|dd|dl|header|main|aside|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decode(s)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.length > limit ? `${s.slice(0, limit)}\n[…cut]` : s;
}
