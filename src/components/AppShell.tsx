import type { ReactNode } from "react";
import Link from "next/link";
import { HandHeart } from "lucide-react";
import { AccountButton } from "@/components/AccountButton";
import { AppNavProvider, AppTabs } from "@/components/AppNav";
import { AppTitleBar } from "@/components/AppTitleBar";
import { TabSwipe } from "@/components/TabSwipe";
import { profileOf } from "@/lib/access";
import { availablePages } from "@/lib/app-pages";
import { getCurrentMember } from "@/lib/session";

/**
 * Full-width frame for the signed-in app. The tabs sit in the top bar on wide
 * screens and become a bottom tab bar on phones, where the page title takes
 * over the top.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const member = await getCurrentMember();
  const pages = availablePages(profileOf(member));

  return (
    <AppNavProvider pages={pages}>
      <div className={`app-shell${pages.length > 1 ? " has-tabs" : ""}`}>
        <header className="app-bar">
          <Link className="app-brand" href="/" aria-label="UCL Volunteering Society home">
            <span className="app-brand-mark"><HandHeart size={18} aria-hidden="true" /></span>
            <span>VolSoc</span>
          </Link>
          <AppTabs />
          <div className="app-bar-account">
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
