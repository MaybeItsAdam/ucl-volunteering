import { NextResponse } from "next/server";
import { readJson } from "@/app/api/plan/http";
import { londonDayKey } from "@/lib/planTime";
import { parseZfwEntry, toZfwRow } from "@/lib/zeroFoodWaste";

/**
 * A shift from /zero-food-waste, passed to the Apps Script that appends it to
 * the team's sheet (apps-script/zero-food-waste). The shared secret proves
 * the request came from here; the script refuses anything without it.
 * `website` is a field people never see: a bot that fills it gets a
 * convincing yes and nothing is written.
 */
export async function POST(request: Request) {
  const url = process.env.ZFW_SHEET_WEBHOOK_URL;
  const secret = process.env.ZFW_SHEET_SECRET;
  if (!url || !secret) return NextResponse.json({ error: "The log isn't connected to the sheet yet" }, { status: 503 });

  const { body, error } = await readJson(request);
  if (error) return error;
  if ((body as { website?: unknown })?.website) return NextResponse.json({ ok: true });

  const parsed = parseZfwEntry(body, londonDayKey(new Date()));
  if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    // Apps Script answers a POST with a redirect to the result, which fetch follows.
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, row: toZfwRow(parsed.value) }),
      cache: "no-store",
    });
    const result = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !result?.ok) throw new Error(result?.error || `HTTP ${res.status}`);
  } catch (e) {
    console.error(`[zero-food-waste] the sheet didn't take the row: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "The sheet didn't save that — try again in a minute" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, total: parsed.value.total });
}
