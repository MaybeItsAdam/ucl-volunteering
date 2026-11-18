import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

/** llmstxt.org summary for AI assistants that cite the society. */
export function GET() {
  const body = `# ${SITE_NAME} (VolSoc)

> ${SITE_DESCRIPTION}

UCL Volunteering Society (VolSoc) is a student society at University College London. Its website, uclvolunteering.org, and the UCL Volunteering app for iOS and Android bring together volunteering events from VolSoc, UCL Student Social Impact and UCL's social impact societies such as Street Aid, Red Cross and Student Action for Refugees. The calendar, the directory of places to volunteer in London, the timetable and the Zero Food Waste log are open to everyone with no sign-in. Joining the volunteer list uses a UCL login.

## Pages

- [Home](${SITE_URL}/): the society and the ways in: what's on, signing up to volunteer, logging a Zero Food Waste collection
- [Volunteering calendar](${SITE_URL}/calendar): volunteering events at UCL in one calendar, filterable by society, with a subscribable iCal feed
- [Volunteer in London](${SITE_URL}/opportunities): places to volunteer across London and upcoming volunteering events on one list and map, with drop-in times, how to sign up and whether a DBS check is needed
- [Volunteering timetable](${SITE_URL}/timetable): every regular session, drop-in and volunteering event in London this week, on one timetable with a map
- [Volunteer with us](${SITE_URL}/volunteer): join VolSoc's volunteer list with a UCL login and say when you're free and what you'd like to do
- [Privacy](${SITE_URL}/privacy): what the website and app collect, why, and how to delete it
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
