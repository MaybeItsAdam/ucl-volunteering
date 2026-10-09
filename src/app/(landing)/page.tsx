import type { Metadata } from "next";
import { HomeIntro } from "@/components/landing/HomeIntro";
import { can, profileOf } from "@/lib/access";
import { getCurrentMember } from "@/lib/session";

export const metadata: Metadata = {
  title: { absolute: "UCL Volunteering Society" },
};

/** Public front page: the flag, the ways in for everyone, and the committee's. */
export default async function HomePage() {
  const member = await getCurrentMember();
  return <HomeIntro signedIn={Boolean(member)} committee={member ? can(profileOf(member), "view_plan") : false} />;
}
