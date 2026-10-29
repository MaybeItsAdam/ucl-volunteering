import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import { extractEntry, nearestStation } from "@/lib/directoryAutofill";
import { requireApiCapability } from "@/lib/session";
import { fetchPublicPage, htmlToText, PageError } from "@/lib/webPage";

// Reading the page and the model's answer can take a while.
export const maxDuration = 60;

/**
 * POST { url } or { text } → { draft }: the directory editor's autofill. The
 * committee only, and one page at a time: it reads what they pointed it at.
 */
export async function POST(request: Request) {
  const auth = await requireApiCapability("edit_plan");
  if (auth.error) return auth.error;
  const { body, error } = await readJson(request);
  if (error) return error;
  const { url, text } = (body ?? {}) as { url?: unknown; text?: unknown };

  let source: string;
  let sourceUrl: string | null = null;
  try {
    if (typeof url === "string" && url.trim()) {
      const page = await fetchPublicPage(url.trim());
      sourceUrl = page.url;
      source = htmlToText(page.html, page.url);
      if (source.length < 80) {
        return NextResponse.json({ error: "That page has almost no text we can read (it may load with JavaScript). Paste the text instead" }, { status: 422 });
      }
    } else if (typeof text === "string" && text.trim().length >= 20) {
      source = text.trim().slice(0, 40_000);
    } else {
      return NextResponse.json({ error: "Paste a link or some text to read" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof PageError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }

  try {
    const draft = await extractEntry(source, sourceUrl);
    if (draft.postcode) {
      const station = await nearestStation(draft.postcode);
      if (station) draft.nearestStation = station;
    }
    return NextResponse.json({ draft, source: sourceUrl });
  } catch (e) {
    console.error(`[directory/autofill] ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "Autofill isn't working right now. Fill it in by hand, or try again later" }, { status: 502 });
  }
}
