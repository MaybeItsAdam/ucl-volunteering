"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useOffline } from "next/offline";
import { DeadEnd } from "@/components/DeadEnd";

/** The error boundary's page (app/error.tsx and the groups' own). */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const offline = useOffline();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DeadEnd
      label={offline ? "Offline" : error.digest ? `Error · ${error.digest}` : "Error"}
      title={offline ? "This needs a connection" : "Something went wrong"}
      quip={offline ? "offline" : "error"}
    >
      <button type="button" className="button primary" onClick={() => retry()}>
        Try again
      </button>
      <Link href="/calendar" className="button">
        What&apos;s on
      </Link>
    </DeadEnd>
  );
}
