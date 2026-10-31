"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Compass, HandHeart, LayoutDashboard, LogIn, MapPinned, Sprout } from "lucide-react";

/**
 * `short` is the phone's tab bar label. `wideOnly` links sit in the wide top
 * bar but not the phone's tab bar, which has room for five; phones reach them
 * from the pages that link to them.
 */
export const PUBLIC_LINKS = [
  { href: "/calendar", label: "Calendar", short: "Calendar", icon: CalendarDays },
  { href: "/timetable", label: "Timetable", short: "Timetable", icon: MapPinned, wideOnly: true },
  { href: "/opportunities", label: "Volunteer in London", short: "Explore", icon: Compass },
  { href: "/volunteer", label: "Volunteer", short: "Volunteer", icon: HandHeart },
  { href: "/zero-food-waste", label: "Zero Food Waste", short: "Food waste", icon: Sprout },
] as const;

const COMMITTEE_LINK = { href: "/portal", label: "Committee", short: "Committee", icon: LayoutDashboard } as const;
const SIGN_IN_LINK = { href: "/auth/signin", label: "Sign in", short: "Sign in", icon: LogIn } as const;

/**
 * The phone's tab bar along the bottom (wide screens use SiteNav in the top
 * bar). The last tab is the way in: sign in when signed out, the committee's
 * dashboard once a committee member is signed in.
 */
export function PublicNav({ committee = false, signedIn = false }: { committee?: boolean; signedIn?: boolean }) {
  const pathname = usePathname();
  const last = committee ? [COMMITTEE_LINK] : signedIn ? [] : [SIGN_IN_LINK];
  const links = [...PUBLIC_LINKS.filter((l) => !("wideOnly" in l)), ...last];
  return (
    <nav className="pub-nav" aria-label="Pages">
      {links.map(({ href, label, short, icon: Icon }) => (
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
