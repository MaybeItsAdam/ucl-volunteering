import type { Metadata } from "next";
import { StaffBoard } from "@/components/staff/StaffBoard";
import { StaffSignIn } from "@/components/staff/StaffSignIn";
import { ALERT_COLUMNS, type CollectionAlert } from "@/lib/collections";
import { getCurrentStaff } from "@/lib/staff";
import { getSupabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "CH&Co staff",
  description: "Tell Zero Food Waste volunteers there is food to collect",
  robots: { index: false },
};

// Who's signed in and what's out now change by the minute.
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const staff = await getCurrentStaff();
  const open = staff
    ? (((
        await getSupabaseAdmin()
          .from("collection_alerts")
          .select(ALERT_COLUMNS)
          .eq("status", "open")
          .gt("collect_by", new Date().toISOString())
          .order("collect_by")
      ).data ?? []) as CollectionAlert[])
    : [];

  return (
    <section className="page narrow">
      <header className="page-head">
        <span className="micro-label">Zero Food Waste</span>
        <h1>CH&amp;Co staff</h1>
      </header>
      {staff ? <StaffBoard name={staff.name} organisation={staff.organisation} open={open} /> : (
        <>
          <p className="muted pub-lede">Got food that would otherwise be thrown away? Tell the volunteers and they&apos;ll come and collect it</p>
          <StaffSignIn />
        </>
      )}
    </section>
  );
}
