"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const PUBLIC_LINKS = [
  { href: "/calendar", label: "Calendar" },
  { href: "/volunteer", label: "Volunteer" },
  { href: "/zero-food-waste", label: "Zero Food Waste" },
] as const;

export function PublicNav() {
  const pathname = usePathname();
  return (
    <nav className="pub-nav" aria-label="Pages">
      {PUBLIC_LINKS.map(({ href, label }) => (
        <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
