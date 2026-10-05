import type { Metadata } from "next";
import { PlannerPage, type PlannerSearchParams } from "@/components/planner/PlannerPage";

export const metadata: Metadata = { title: "Planner · Documents" };

/** The document prep board: Backlog → Drafting → In review → Submitted → Approved. */
export default function DocumentsPlannerPage({ searchParams }: { searchParams: PlannerSearchParams }) {
  return <PlannerPage board="documents" searchParams={searchParams} />;
}
