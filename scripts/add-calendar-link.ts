/**
 * Link a committee member's calendar for them, the same as they would from
 * "My calendars": the link is fetched and checked, stored encrypted, and its
 * busy times join the Schedule's availability.
 *
 *   scripts/doppler.sh run -p volsoc-webapp -c prd -- npx -y tsx scripts/add-calendar-link.ts "<name or email>" "<url>"
 *
 * The member is found by email, or else by a name starting with what's given;
 * it stops unless exactly one matches. The URL is an argument, never a file in
 * this repo: a timetable link is as good as a password to that timetable.
 */
import { addCalendarLink } from "@/lib/calendarLinks";
import { getSupabaseAdmin } from "@/lib/supabase";

async function main() {
  const [who, url] = process.argv.slice(2);
  if (!who || !url) {
    console.error('Usage: add-calendar-link.ts "<name or email>" "<calendar url>"');
    process.exit(2);
  }
  const db = getSupabaseAdmin();
  const query = who.includes("@")
    ? db.from("members").select("id, name, email").ilike("email", who)
    : db.from("members").select("id, name, email").ilike("name", `${who.replace(/[%_]/g, "")}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data?.length) {
    console.error(`No member matches "${who}"; they need to have signed in once`);
    process.exit(1);
  }
  if (data.length > 1) {
    console.error(`"${who}" matches ${data.length} members: ${data.map((m) => `${m.name} <${m.email}>`).join(", ")}; use their email`);
    process.exit(1);
  }
  const member = data[0];
  const result = await addCalendarLink(member.id, "ucl_timetable", url, null);
  if (!result.ok) {
    console.error(`${member.name}: ${result.error.replace(/\n/g, " ")}`);
    process.exit(1);
  }
  console.log(`${member.name}: linked ${result.link.kind}, ${result.link.blockCount} busy times`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
