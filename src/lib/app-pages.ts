import { can, type AccessProfile } from "@/lib/access";

export type AppPage = "calendar" | "planner" | "volunteers" | "whats_on" | "members" | "settings";

export const APP_PAGE_HREFS: Record<AppPage, string> = {
  calendar: "/portal/calendar",
  planner: "/portal/planner",
  volunteers: "/portal/volunteers",
  whats_on: "/portal/whats-on",
  members: "/portal/members",
  settings: "/account",
};

/**
 * The signed-in app's pages, in tab order; sign-in lands on the first. The
 * committee lands on the calendar. Someone signed in without a role lands on
 * What's on, the social impact societies' upcoming events.
 */
export function availablePages(profile: AccessProfile | null): AppPage[] {
  const pages: AppPage[] = [];
  if (can(profile, "view_plan")) pages.push("calendar", "planner", "volunteers");
  if (can(profile, "view_whats_on")) pages.push("whats_on");
  if (can(profile, "manage_members")) pages.push("members");
  pages.push("settings");
  return pages;
}

/**
 * The committee's pages that earn a tab in the top bar beside the public
 * ones: What's on is the public calendar again, and Settings is in the
 * account menu.
 */
export function committeeTabs(pages: AppPage[]): AppPage[] {
  return pages.filter((p) => p !== "whats_on" && p !== "settings");
}
