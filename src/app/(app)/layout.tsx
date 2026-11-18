import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { noIndex } from "@/lib/seo";

/** The committee portal, behind UCL sign-in: kept out of search. */
export const metadata = noIndex;

/**
 * The signed-in tabs share one frame. Living in a layout, it is rendered once
 * and kept while the tabs change beneath it, so a tap only waits on the page
 * that changed, and the tab bar and title never blink out between.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
