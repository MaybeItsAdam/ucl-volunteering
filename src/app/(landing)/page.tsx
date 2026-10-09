import type { Metadata } from "next";
import { HomeIntro } from "@/components/landing/HomeIntro";

export const metadata: Metadata = {
  title: { absolute: "UCL Volunteering Society" },
};

/** Public front page: the flag and the ways in for everyone. */
export default function HomePage() {
  return <HomeIntro />;
}
