import { describe, expect, it } from "vitest";
import { fetchPublicPage, htmlToText, PageError } from "./webPage";

describe("htmlToText", () => {
  it("keeps the words and the links, drops scripts and page furniture", () => {
    const html = `<html><head><title>x</title><style>p{}</style></head><body>
      <nav>Home | About</nav>
      <h1>Kitchen volunteer</h1>
      <p>Drop in Tuesdays 10am&ndash;1pm. <a href="/apply">Apply here</a> or email <a href="mailto:vols@crisis.org.uk">us</a>.</p>
      <script>track()</script><footer>© 2026</footer></body></html>`;
    const text = htmlToText(html, "https://crisis.org.uk/volunteer/");
    expect(text).toContain("Kitchen volunteer");
    expect(text).toContain("Drop in Tuesdays 10am–1pm.");
    expect(text).toContain("Apply here (https://crisis.org.uk/apply)");
    expect(text).toContain("us (mailto:vols@crisis.org.uk)");
    expect(text).not.toMatch(/track\(\)|Home \| About|© 2026|p\{\}/);
  });

  it("cuts very long pages", () => {
    expect(htmlToText(`<p>${"a".repeat(100)}</p>`, "https://x.org", 10)).toBe("aaaaaaaaaa\n[…cut]");
  });
});

describe("fetchPublicPage", () => {
  const html = (body: string, init: ResponseInit = {}) =>
    new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init });

  it("refuses hosts that resolve to private or metadata addresses", async () => {
    await expect(
      fetchPublicPage("https://internal.example/", { lookupImpl: async () => [{ address: "169.254.169.254" }], fetchImpl: async () => html("x") }),
    ).rejects.toBeInstanceOf(PageError);
  });

  it("re-checks every redirect hop", async () => {
    const lookups: string[] = [];
    const fetchImpl = (async (url: string) =>
      url.startsWith("https://public.org")
        ? new Response(null, { status: 302, headers: { location: "http://localhost/admin" } })
        : html("secret")) as unknown as typeof fetch;
    await expect(
      fetchPublicPage("https://public.org/", {
        fetchImpl,
        lookupImpl: async (host) => {
          lookups.push(host);
          return [{ address: host === "localhost" ? "127.0.0.1" : "93.184.216.34" }];
        },
      }),
    ).rejects.toBeInstanceOf(PageError);
    expect(lookups).toEqual(["public.org", "localhost"]);
  });

  it("returns the page from a public host", async () => {
    const page = await fetchPublicPage("https://public.org/v", {
      lookupImpl: async () => [{ address: "93.184.216.34" }],
      fetchImpl: (async () => html("<p>hi</p>")) as unknown as typeof fetch,
    });
    expect(page).toEqual({ html: "<p>hi</p>", url: "https://public.org/v" });
  });
});
