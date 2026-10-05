import Link from "next/link";
import "./plan.css";

export type PlanSection = "week" | "list";

/** Week · List, shared by the plan pages. Carries the week across so List → Week lands where you were. */
export function PlanSubnav({ active, week }: { active: PlanSection; week?: string }) {
  const items: { key: PlanSection; href: string; label: string }[] = [
    { key: "week", href: week ? `/portal/plan?week=${week}` : "/portal/plan", label: "Week" },
    { key: "list", href: "/portal/plan/list", label: "List" },
  ];
  return (
    <nav className="subnav plan-subnav" aria-label="Plan">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={item.key === active ? "active" : undefined}
          aria-current={item.key === active ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
