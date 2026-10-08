import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeSetting";
import { VolSocHand } from "@/components/landing/VolSocHand";
import { PublicNav } from "./PublicNav";
import "./public.css";

/** A plain top bar over the public pages; no tabs, no account. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="pub-shell">
      <header className="pub-bar">
        <Link className="pub-brand" href="/" aria-label="UCL Volunteering Society home">
          <VolSocHand className="pub-brand-mark" title="" />
          <span>VolSoc</span>
        </Link>
        <PublicNav />
        <ThemeToggle className="pub-theme" />
      </header>
      <main className="pub-main">{children}</main>
    </div>
  );
}
