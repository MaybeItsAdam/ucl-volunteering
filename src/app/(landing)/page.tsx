import type { Metadata } from "next";
import { HomeIntro } from "@/components/landing/HomeIntro";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: { absolute: "UCL Volunteering Society" },
};

/** Public front page: the flag, and the committee's way in. */
export default async function HomePage() {
  return <HomeIntro signedIn={Boolean(await getSession())} />;
}
