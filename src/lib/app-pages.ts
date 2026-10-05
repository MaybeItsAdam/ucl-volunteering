import { can, type AccessProfile } from "@/lib/access";

export type AppPage = "calendar" | "members" | "settings";

export const APP_PAGE_HREFS: Record<AppPage, string> = {
  calendar: "/portal/calendar",
  members: "/portal/members",
  settings: "/account",
};

/**
 * The signed-in app's pages, in tab order. The calendar comes first, so it is where
 * sign-in lands for the committee. Someone signed in without a role sees only
 * Settings, which tells them how to get on the committee.
 */
export function availablePages(profile: AccessProfile | null): AppPage[] {
  const pages: AppPage[] = [];
  if (can(profile, "view_plan")) pages.push("calendar");
  if (can(profile, "manage_members")) pages.push("members");
  pages.push("settings");
  return pages;
}
