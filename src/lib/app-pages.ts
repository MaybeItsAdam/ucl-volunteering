import { can, type AccessProfile } from "@/lib/access";

export type AppPage = "plan" | "planner" | "availability" | "members" | "settings";

export const APP_PAGE_HREFS: Record<AppPage, string> = {
  plan: "/portal/plan",
  planner: "/portal/planner",
  availability: "/portal/availability",
  members: "/portal/members",
  settings: "/account",
};

/**
 * The signed-in app's pages, in tab order. The plan comes first, so it is where
 * sign-in lands for the committee. Someone signed in without a role sees only
 * Settings, which tells them how to get on the committee.
 */
export function availablePages(profile: AccessProfile | null): AppPage[] {
  const pages: AppPage[] = [];
  if (can(profile, "view_plan")) pages.push("plan", "planner", "availability");
  if (can(profile, "manage_members")) pages.push("members");
  pages.push("settings");
  return pages;
}
