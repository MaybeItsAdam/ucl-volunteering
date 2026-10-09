"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGE_META } from "@/components/AppNav";
import { PUBLIC_LINKS } from "@/components/public/PublicNav";
import { APP_PAGE_HREFS, type AppPage } from "@/lib/app-pages";

const isAt = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/**
 * The top bar's tabs on wide screens, the same on every page: the public
 * pages, then after a divider the committee's, for a committee member. On a
 * phone each shell has its own tab bar along the bottom instead.
 */
export function SiteNav({ committee }: { committee: AppPage[] }) {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="Pages">
      {PUBLIC_LINKS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={isAt(pathname, href) ? "page" : undefined}>
          <Icon size={16} aria-hidden="true" />
          {label}
        </Link>
      ))}
      {committee.length > 0 && (
        <>
          <span className="site-nav-divider" role="separator" aria-orientation="vertical" />
          {committee.map((page) => {
            const { label, icon: Icon } = PAGE_META[page];
            const href = APP_PAGE_HREFS[page];
            return (
              <Link key={page} href={href} aria-current={isAt(pathname, href) ? "page" : undefined}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}
