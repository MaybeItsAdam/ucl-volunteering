/**
 * Member identity hues, all brand colours. The keys are what the database
 * stores and predate the brand, so each now names a brand colour: purple is
 * lavender, orange is tomato, azure is strong cyan, emerald is lime moss and
 * amber is golden pollen.
 *
 * Shared by anything that draws a member's dot, avatar or overlay (the
 * availability page, the planner's availability overlay). Prefer the CSS route
 * where you can: `<span className="swatch" data-colour={colour} />` picks up
 * `--hue` from globals.css and so stays one source of truth. The hex map is for
 * places CSS cannot reach (canvas, inline SVG, computed styles).
 */

import { MEMBER_COLOURS, type MemberColour } from "@/lib/access";

export const MEMBER_HUES: Record<MemberColour, string> = {
  purple: "#9b5de5",
  pink: "#ff99c8",
  orange: "#f26640",
  azure: "#10c4c0",
  emerald: "#8fb339",
  amber: "#ffd23f",
};

/** The CSS custom property of each hue, defined in globals.css's palette layer. */
export const MEMBER_HUE_VARS: Record<MemberColour, string> = {
  purple: "var(--lavender-purple)",
  pink: "var(--baby-pink)",
  orange: "var(--tomato)",
  azure: "var(--strong-cyan)",
  emerald: "var(--lime-moss)",
  amber: "var(--golden-pollen)",
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
