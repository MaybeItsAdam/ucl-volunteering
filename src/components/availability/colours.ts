/**
 * Member identity hues: the categorical extras plus azure and emerald.
 *
 * Shared by anything that draws a member's dot, avatar or overlay (the
 * availability page, the planner's availability overlay). Prefer the CSS route
 * where you can: `<span className="swatch" data-colour={colour} />` picks up
 * `--hue` from globals.css and so stays one source of truth. The hex map is for
 * places CSS cannot reach (canvas, inline SVG, computed styles).
 */

import { MEMBER_COLOURS, type MemberColour } from "@/lib/access";

export const MEMBER_HUES: Record<MemberColour, string> = {
  purple: "#7a4de8",
  pink: "#ff88dc",
  orange: "#ff6b2b",
  azure: "#007fff",
  emerald: "#4cc38e",
  amber: "#ffbf00",
};

/** The CSS custom property of each hue, defined in globals.css's palette layer. */
export const MEMBER_HUE_VARS: Record<MemberColour, string> = {
  purple: "var(--purple)",
  pink: "var(--pink)",
  orange: "var(--orange)",
  azure: "var(--azure)",
  emerald: "var(--emerald)",
  amber: "var(--amber)",
};

/**
 * A member's colour, falling back to one picked by their place in the list for
 * the rare member stored without one, so everyone on screen has a dot.
 */
export function colourOf(member: { colour: MemberColour | null }, index: number): MemberColour {
  return member.colour ?? MEMBER_COLOURS[index % MEMBER_COLOURS.length];
}

/** Two-letter initials for an avatar: "Ada Lovelace" → "AL", "Plato" → "PL". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words.at(-1)![0]).toUpperCase();
}
