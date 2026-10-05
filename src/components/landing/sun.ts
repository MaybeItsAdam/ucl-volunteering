"use client";

import { useSyncExternalStore } from "react";
import SunCalc from "suncalc";
import { getEffectiveDate, useTimeOverride } from "./timeOverride";

// London (UCL): real lat/lon used for live sun position via SunCalc.
const LONDON_LAT = 51.5074;
const LONDON_LON = -0.1278;

// "Elevation" thresholds, expressed as sin(sun-altitude in radians):
// >= SKY_DAY_ELEV  → full day sky.  6° above horizon.
// 0..SKY_DAY_ELEV  → blend dusk → day.  Sun at horizon up to ~6°.
// SKY_NIGHT_ELEV..0 → blend night → dusk. Civil/nautical twilight, 0° to -12°.
// <= SKY_NIGHT_ELEV → full night sky. Sun more than 12° below horizon.
const SKY_DAY_ELEV = Math.sin((6 * Math.PI) / 180); // ≈ 0.105
const SKY_NIGHT_ELEV = Math.sin((-12 * Math.PI) / 180); // ≈ -0.208

type Rgb = readonly [number, number, number];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColor(c1: Rgb, c2: Rgb, t: number): Rgb {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

function rgb([r, g, b]: Rgb) {
  return `rgb(${r}, ${g}, ${b})`;
}

const SKY_NIGHT_TOP: Rgb = [8, 12, 30];
const SKY_NIGHT_BOT: Rgb = [26, 40, 78];
const SKY_DUSK_TOP: Rgb = [42, 30, 96];
const SKY_DUSK_BOT: Rgb = [236, 132, 92];
const SKY_DAY_TOP: Rgb = [60, 126, 214];
const SKY_DAY_BOT: Rgb = [168, 208, 240];

export function skyColors(elevation: number): { top: string; bot: string } {
  let top: Rgb;
  let bot: Rgb;
  if (elevation >= SKY_DAY_ELEV) {
    top = SKY_DAY_TOP;
    bot = SKY_DAY_BOT;
  } else if (elevation >= 0) {
    const t = elevation / SKY_DAY_ELEV;
    top = lerpColor(SKY_DUSK_TOP, SKY_DAY_TOP, t);
    bot = lerpColor(SKY_DUSK_BOT, SKY_DAY_BOT, t);
  } else if (elevation >= SKY_NIGHT_ELEV) {
    const t = (elevation - SKY_NIGHT_ELEV) / -SKY_NIGHT_ELEV;
    top = lerpColor(SKY_NIGHT_TOP, SKY_DUSK_TOP, t);
    bot = lerpColor(SKY_NIGHT_BOT, SKY_DUSK_BOT, t);
  } else {
    top = SKY_NIGHT_TOP;
    bot = SKY_NIGHT_BOT;
  }
  return { top: rgb(top), bot: rgb(bot) };
}

export interface SunState {
  elevation: number;
  altitude: number;
  azimuth: number;
  sunPosition: [number, number, number];
  sunColor: string;
  ambientIntensity: number;
  directIntensity: number;
  nightFactor: number;
  showStars: boolean;
}

function computeSunState(date: Date): SunState {
  // Real solar position for London at the given moment. SunCalc returns
  // altitude (radians above horizon) and azimuth (radians clockwise from south).
  const pos = SunCalc.getPosition(date, LONDON_LAT, LONDON_LON);
  const altitude = pos.altitude;
  const azimuth = pos.azimuth;

  // Normalised sun height: sin(altitude) maps the [-π/2, π/2] altitude range to
  // [-1, 1], matching the scene's expected scale for sun.elevation.
  const elevation = Math.sin(altitude);

  // Horizontal sun position. SunCalc's azimuth is measured clockwise from
  // south, so −sin(azimuth) gives east = +1 / west = −1, which is what the
  // celestial-body placement and theme code assume.
  const horizontal = -Math.sin(azimuth);
  const distance = 100;
  const sunPosition: [number, number, number] = [
    horizontal * distance,
    elevation * distance,
    30,
  ];

  const daylight = Math.max(0, elevation);
  const belowHorizon = elevation < 0;
  // "Golden hour" — sun above horizon but within ~14° of it.
  const isGolden = !belowHorizon && altitude < (14 * Math.PI) / 180;

  let sunColor = "#fff4d6";
  if (belowHorizon) sunColor = "#5873a8";
  else if (isGolden) sunColor = "#ffb070";

  const ambientIntensity = 0.38 + 0.4 * daylight;
  const directIntensity = belowHorizon ? 0.25 : 0.4 + daylight * 0.9;

  // Ramps from 0 in daylight to 1 at deep night (sun ≥ 12° below horizon),
  // used to drive a warm flag-floodlight effect so the flag stays readable
  // after sunset rather than fading into the dark sky.
  const nightFactor = Math.max(0, Math.min(1, -elevation / -SKY_NIGHT_ELEV));

  return {
    elevation,
    altitude,
    azimuth,
    sunPosition,
    sunColor,
    ambientIntensity,
    directIntensity,
    nightFactor,
    showStars: elevation < 0.05,
  };
}

// What the server (and the first client render, during hydration) paints: a
// fixed midsummer noon, so the prerendered HTML is deterministic and the real
// sky fades in once the browser knows the time.
const SERVER_SUN = computeSunState(new Date("2026-06-21T12:00:00Z"));

// A clock that ticks once a minute. The snapshot is the minute index so it is
// a stable primitive between ticks.
function subscribeMinute(cb: () => void) {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);
const minuteOnServer = () => null;

/** The sun over London now (or at the debug override hour). */
export function useSunState(): SunState {
  const override = useTimeOverride();
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, minuteOnServer);
  if (minute === null) return SERVER_SUN;
  // `override` is read by getEffectiveDate; listed here so a change re-renders.
  void override;
  return computeSunState(getEffectiveDate());
}
