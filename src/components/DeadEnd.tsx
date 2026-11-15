import type { ReactNode } from "react";
import { VolSocHand } from "@/components/landing/VolSocHand";
import { Quip } from "@/components/Quip";
import type { QuipKind } from "@/lib/quips";

/**
 * The page for a dead end (missing page, crash): the hand, a plain heading,
 * a one-liner, and a way out. Centred in whatever frame it lands in.
 */
export function DeadEnd({
  label,
  title,
  quip,
  children,
}: {
  label: string;
  title: string;
  quip: QuipKind;
  children: ReactNode;
}) {
  return (
    <section className="dead-end">
      <VolSocHand className="dead-end-mark" title="" />
      <span className="micro-label">{label}</span>
      <h1>{title}</h1>
      <Quip kind={quip} className="dead-end-quip" />
      <div className="dead-end-actions">{children}</div>
    </section>
  );
}
