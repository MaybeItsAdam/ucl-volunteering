import type { Metadata } from "next";
import { CollectionAlerts } from "@/components/CollectionAlerts";
import { ZeroFoodWasteForm } from "@/components/public/ZeroFoodWasteForm";
import { ALERT_COLUMNS, type CollectionAlert } from "@/lib/collections";
import { londonDayKey, londonTime } from "@/lib/planTime";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { ZFW_SHEET_URL } from "@/lib/zeroFoodWaste";

export const metadata: Metadata = {
  title: "Zero Food Waste log",
  description: "Log what you collected on a Zero Food Waste shift",
  robots: { index: false },
};

// Today's date is the form's default, so the page can't be built once and kept.
export const dynamic = "force-dynamic";

/** Food CH&Co staff have said is ready, still inside its time. Empty when the database can't say. */
async function loadAvailable(): Promise<CollectionAlert[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await getSupabaseAdmin()
    .from("collection_alerts")
    .select(ALERT_COLUMNS)
    .eq("status", "open")
    .gt("collect_by", new Date().toISOString())
    .order("collect_by");
  return (data ?? []) as CollectionAlert[];
}

export default async function ZeroFoodWastePage() {
  const available = await loadAvailable();
  return (
    <section className="page narrow">
      <header className="page-head zfw-head">
        <span className="micro-label">Zero Food Waste</span>
        <h1>Log a collection</h1>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed asset, no resizing needed */}
        <img className="zfw-logo" src="/zfw.png" alt="Zero Food Waste UCL" width={307} height={360} />
      </header>
      {available.length > 0 && (
        <section className="notice ok col-available" aria-labelledby="col-available-title">
          <strong id="col-available-title">Food ready to collect</strong>
          <ul className="col-list">
            {available.map((a) => (
              <li key={a.id}>
                <div>
                  <strong>{a.outlet}</strong>
                  <span className="small">
                    {a.what} · until {londonTime(new Date(a.collect_by))}
                  </span>
                  {a.note && <span className="small muted">{a.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CollectionAlerts />
      <p className="muted pub-lede">
        One entry per outlet, straight after your shift. It goes into the team&apos;s{" "}
        <a href={ZFW_SHEET_URL} target="_blank" rel="noreferrer">
          tracking sheet
        </a>
      </p>
      <ZeroFoodWasteForm today={londonDayKey(new Date())} />
    </section>
  );
}
