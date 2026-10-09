import type { ReactNode } from "react";
import Link from "next/link";
import { AccountButton } from "@/components/AccountButton";
import { AppNavProvider, AppTabs } from "@/components/AppNav";
import { SiteNav } from "@/components/SiteNav";
import { AppTitleBar } from "@/components/AppTitleBar";
import { TabSwipe } from "@/components/TabSwipe";
import { ThemeToggle } from "@/components/ThemeSetting";
import { VolSocHand } from "@/components/landing/VolSocHand";
import { profileOf } from "@/lib/access";
import { availablePages, committeeTabs } from "@/lib/app-pages";
import { getCurrentMember } from "@/lib/session";

/**
 * Full-width frame for the signed-in app. On wide screens the top bar is the
 * public pages' (every tab, the committee's after a divider); on phones the
 * app's own tabs become a bottom tab bar, and the page title takes over the top.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const member = await getCurrentMember();
  const pages = availablePages(profileOf(member));

  return (
    <AppNavProvider pages={pages}>
      <div className={`app-shell${pages.length > 1 ? " has-tabs" : ""}`}>
        <header className="app-bar">
          <Link className="app-brand" href="/" aria-label="UCL Volunteering Society home">
            <VolSocHand className="app-brand-mark" title="" />
            <span>VolSoc</span>
          </Link>
          <SiteNav committee={committeeTabs(pages)} />
          <AppTabs />
          <div className="app-bar-account">
            <ThemeToggle />
            <AccountButton member={member} />
          </div>
        </header>
        <AppTitleBar />
        <main className="app-main">
          <TabSwipe>{children}</TabSwipe>
        </main>
      </div>
    </AppNavProvider>
  );
}
