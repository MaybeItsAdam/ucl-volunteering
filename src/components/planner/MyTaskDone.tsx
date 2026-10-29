"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { finalStatus, type TaskBoard } from "@/lib/types";
import { patchTask } from "./api";

/** One tap to finish an item: moves it to its board's last column (Done, Approved). */
export function MyTaskDone({ id, title, board }: { id: string; title: string; board: TaskBoard }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function done() {
    setBusy(true);
    setError(false);
    try {
      await patchTask(id, { status: finalStatus(board) });
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <button type="button" className="button small" onClick={done} disabled={busy} aria-label={`Mark ${title} as done`}>
      <Check size={14} aria-hidden="true" />
      {error ? "Try again" : busy ? "Saving…" : "Done"}
    </button>
  );
}
