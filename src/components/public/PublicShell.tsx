import type { ReactNode } from "react";
import Link from "next/link";
import { AccountButton } from "@/components/AccountButton";
import { SiteNav } from "@/components/SiteNav";
import { ThemeToggle } from "@/components/ThemeSetting";
import { VolSocHand } from "@/components/landing/VolSocHand";
import { can, profileOf } from "@/lib/access";
import { availablePages, committeeTabs } from "@/lib/app-pages";
import { getCurrentMember } from "@/lib/session";
import { PublicNav } from "./PublicNav";
import "./public.css";

/**
 * A plain top bar over the public pages on wide screens: every tab (a
 * committee member's own after a divider), and sign-in or your account at the
 * right. On a phone the bar goes and the page runs edge to edge, with only the
 * tab bar along the bottom.
 */
export async function PublicShell({ children }: { children: ReactNode }) {
  const member = await getCurrentMember();
  const committee = member ? can(profileOf(member), "view_plan") : false;
  return (
    <div className="pub-shell">
      <header className="pub-bar">
        <Link className="pub-brand" href="/" aria-label="UCL Volunteering Society home">
          <VolSocHand className="pub-brand-mark" title="" />
          <span>VolSoc</span>
        </Link>
        <SiteNav committee={committeeTabs(availablePages(profileOf(member)))} />
        <PublicNav committee={committee} signedIn={Boolean(member)} />
        <div className="pub-account">
          <ThemeToggle />
          <AccountButton member={member} />
        </div>
      </header>
      <main className="pub-main">{children}</main>
    </div>
  );
}
