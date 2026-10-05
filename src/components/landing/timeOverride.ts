"use client";

import { useSyncExternalStore } from "react";

/**
 * A debug override for the time of day the landing scene renders at, as an
 * hour in [0, 24). Null means live. Module-level so the time panel and the
 * flag (which live in different trees) share one value.
 */
let overrideHour: number | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit() {
  for (const l of listeners) l();
}

export function setTimeOverride(hour: number) {
  overrideHour = hour;
  emit();
}

export function clearTimeOverride() {
  overrideHour = null;
  emit();
}

export function useTimeOverride(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => overrideHour,
    () => null,
  );
}

export function getEffectiveDate(): Date {
  const d = new Date();
  if (overrideHour == null) return d;
  const wholeHour = Math.floor(overrideHour);
  const minutes = Math.round((overrideHour - wholeHour) * 60);
  d.setHours(wholeHour, minutes, 0, 0);
  return d;
}
