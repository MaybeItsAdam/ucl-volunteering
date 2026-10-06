import type { Metadata } from "next";
import { PlannerPage, type PlannerSearchParams } from "@/components/planner/PlannerPage";

export const metadata: Metadata = { title: "Planner · Events" };

/** The events board: Backlog → Planned → Ready to post → Content → Done. */
export default function EventsPlannerPage({ searchParams }: { searchParams: PlannerSearchParams }) {
  return <PlannerPage board="events" searchParams={searchParams} />;
}
