import Link from "next/link";
import "./plan.css";

export type PlanSection = "week" | "list" | "feeds";

/**
 * Week · List · Public calendar, shared by the plan pages, as a segmented
 * control that sits in a toolbar. Carries the week across so List → Week
 * lands where you were.
 */
export function PlanSubnav({ active, week }: { active: PlanSection; week?: string }) {
  const items: { key: PlanSection; href: string; label: string }[] = [
    { key: "week", href: week ? `/portal/calendar?week=${week}` : "/portal/calendar", label: "Week" },
    { key: "list", href: "/portal/calendar/list", label: "List" },
    { key: "feeds", href: "/portal/calendar/feeds", label: "Public calendar" },
  ];
  return (
    <nav className="segmented plan-subnav" aria-label="Schedule">
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
