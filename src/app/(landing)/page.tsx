import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { HomeIntro } from "@/components/landing/HomeIntro";
import { homeGraph, pageMetadata, SITE_DESCRIPTION } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({ title: "UCL Volunteering Society — Volunteer at UCL and in London", description: SITE_DESCRIPTION, path: "/" }),
  title: { absolute: "UCL Volunteering Society — Volunteer at UCL and in London" },
};

/** Public front page: the flag and the ways in for everyone. */
export default function HomePage() {
  return (
    <>
      <JsonLd data={homeGraph()} />
      <HomeIntro />
    </>
  );
}
