import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: { absolute: "UCL Volunteering Society" },
};

/** Public front page: the flag. The committee's way in is its sign-in link. */
export default function HomePage() {
  return <Landing />;
}
