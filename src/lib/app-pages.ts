import { can, type AccessProfile } from "@/lib/access";

export type AppPage = "calendar" | "planner" | "whats_on" | "members" | "settings";

export const APP_PAGE_HREFS: Record<AppPage, string> = {
  calendar: "/portal/calendar",
  planner: "/portal/planner",
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
  if (can(profile, "view_plan")) pages.push("calendar", "planner");
  if (can(profile, "view_whats_on")) pages.push("whats_on");
  if (can(profile, "manage_members")) pages.push("members");
  pages.push("settings");
  return pages;
}
