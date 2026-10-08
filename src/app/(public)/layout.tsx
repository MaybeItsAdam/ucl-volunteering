import type { ReactNode } from "react";
import { PublicShell } from "@/components/public/PublicShell";

/** The public pages anyone can open without signing in: the calendar and the forms. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
