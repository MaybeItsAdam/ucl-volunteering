"use client";

import { useSyncExternalStore } from "react";

/**
 * One-liners for the pages nobody wants to see: a missing page, a crash, no
 * signal. A light touch so a dead end doesn't feel like one; the heading and
 * the buttons around them still say plainly what happened.
 */
export const QUIPS = {
  notFound: [
    "This page has gone off to volunteer somewhere else.",
    "We looked everywhere. Even behind the litter pickers.",
    "This page didn't sign up for the shift.",
    "No page here, but plenty of good causes elsewhere.",
    "Wrong turn at the food bank. Happens to the best of us.",
    "Many hands make light work. None of them could find this page.",
  ],
  error: [
    "Something broke. We're putting the gloves on and picking it up.",
    "This page dropped its collection bucket. Coins everywhere.",
    "Even volunteers need a tea break. Give it a moment.",
    "Spill in aisle five. Mopping now.",
  ],
  offline: [
    "Good time to help someone in person.",
    "The internet is volunteering elsewhere right now.",
    "Your phone's taken the day off. Very on brand.",
    "Kindness still works offline.",
  ],
} as const;

export type QuipKind = keyof typeof QUIPS;

// One pick per kind per page load, so a re-render doesn't change the joke.
const chosen: Partial<Record<QuipKind, string>> = {};
const subscribe = () => () => {};

/**
 * A random quip of the kind, or null while server rendering and hydrating (a
 * random pick there would differ between server and phone).
 */
export function useQuip(kind: QuipKind): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const list = QUIPS[kind];
      return (chosen[kind] ??= list[Math.floor(Math.random() * list.length)]);
    },
    () => null,
  );
}
