import type { Metadata } from "next";
import { HomeIntro } from "@/components/landing/HomeIntro";
import { getCurrentMember } from "@/lib/session";

export const metadata: Metadata = {
  title: { absolute: "UCL Volunteering Society" },
};

/** Public front page: the flag, the ways in for everyone, and the committee's sign-in. */
export default async function HomePage() {
  const member = await getCurrentMember();
  return <HomeIntro signedIn={Boolean(member)} />;
}
