"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, HandHeart, Sprout } from "lucide-react";

/** `short` is the phone's tab bar label. */
export const PUBLIC_LINKS = [
  { href: "/calendar", label: "Calendar", short: "Calendar", icon: CalendarDays },
  { href: "/volunteer", label: "Volunteer", short: "Volunteer", icon: HandHeart },
  { href: "/zero-food-waste", label: "Zero Food Waste", short: "Food waste", icon: Sprout },
] as const;

/** Tabs in the top bar on wide screens, a bar along the bottom on phones. */
export function PublicNav() {
  const pathname = usePathname();
  return (
    <nav className="pub-nav" aria-label="Pages">
      {PUBLIC_LINKS.map(({ href, label, short, icon: Icon }) => (
        <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
          <span className="pub-nav-icon" aria-hidden="true">
            <Icon size={20} />
          </span>
          <span className="pub-nav-long">{label}</span>
          <span className="pub-nav-short" aria-hidden="true">
            {short}
          </span>
        </Link>
      ))}
    </nav>
  );
}
