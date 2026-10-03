"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runSync } from "./api";

/**
 * "Synced 06:30" and a Sync now button. The label is worked out on the server
 * (it knows the London time of the last run); the button pulls the Social
 * Impact feed now and re-renders the week.
 */
export function SyncStatus({
  label,
  tone,
  title,
  canSync,
}: {
  label: string;
  tone: "ok" | "bad" | "neutral";
  title?: string;
  canSync: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const result = await runSync();
      if (!result.ok) throw new Error(result.error || "Sync failed");
      startRefresh(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  const working = busy || refreshing;
  return (
    <div className="plan-sync">
      <span className={tone === "neutral" ? "tag" : `tag ${tone}`} title={title}>
        {label}
      </span>
      {canSync && (
        <button type="button" className="button small" onClick={sync} disabled={working} aria-busy={working}>
          <RefreshCw size={14} aria-hidden="true" className={working ? "plan-spin" : undefined} />
          {working ? "Syncing…" : "Sync now"}
        </button>
      )}
      {error && (
        <span className="plan-inline-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
