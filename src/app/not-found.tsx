import type { Metadata } from "next";
import Link from "next/link";
import { DeadEnd } from "@/components/DeadEnd";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="dead-end-page">
      <DeadEnd label="404 · Page not found" title="Nothing here" quip="notFound">
        <Link href="/calendar" className="button primary">
          What&apos;s on
        </Link>
        <Link href="/" className="button">
          Home
        </Link>
      </DeadEnd>
    </main>
  );
}
