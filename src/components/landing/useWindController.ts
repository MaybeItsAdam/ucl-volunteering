"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const WIND_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=51.5223&longitude=-0.1259" +
  "&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m";

const KMH_TO_MPH = 0.621371;

// Diurnal base: peak 14 mph at 16:00, trough 5 mph at 04:00
function diurnalMph(hour: number) {
  return 9.5 + 4.5 * Math.cos((2 * Math.PI * (hour - 16)) / 24);
}

// Seasonal multiplier: 1.2× January, 0.8× July
function seasonalMultiplier(month: number) {
  return 1.0 + 0.2 * Math.cos((2 * Math.PI * (month - 1)) / 12);
}

function mphToWindStrength(mph: number) {
  if (mph <= 0) return 0;
  if (mph <= 4) return 0.025 * mph;
  if (mph <= 14) return 0.15 + ((mph - 4) / 10) * 0.85; // 0.15 → 1.0
  if (mph <= 23) return 1.0 + ((mph - 14) / 9) * 0.6; // 1.0  → 1.6
  return Math.min(2.0, 1.6 + ((mph - 23) / 10) * 0.4); // 1.6  → 2.0
}

function mphToTurbulence(mph: number) {
  if (mph <= 7) return Math.max(0, (mph - 4) / 3) * 0.1;
  if (mph <= 14) return 0.1 + ((mph - 7) / 7) * 0.3;
  if (mph <= 22) return 0.4 + ((mph - 14) / 8) * 0.4;
  return Math.min(1.0, 0.8 + ((mph - 22) / 8) * 0.2);
}

export function mphToStateLabel(mph: number) {
  if (mph < 8) return "Idle Lull";
  if (mph < 15) return "Active Urban";
  if (mph < 23) return "Gust Peak";
  return "Storm State";
}

/** High-frequency values read by the flag shader every frame. */
export interface WindState {
  strength: number;
  turbulence: number;
  directionDelta: number;
}

export type WindRef = RefObject<WindState>;

interface OpenMeteoCurrent {
  wind_speed_10m?: number;
  wind_direction_10m?: number;
  wind_gusts_10m?: number;
}

export interface WindDisplay {
  mode: "live" | "sim";
  stateLabel: string;
  mph: number;
  directionDelta: number;
  rawData: OpenMeteoCurrent | null;
}

interface Spring {
  pos: number;
  vel: number;
  k: number;
  c: number;
}

/**
 * Wind over Bloomsbury: live from Open-Meteo when reachable, otherwise a
 * diurnal/seasonal simulation, with gusts and a drifting direction layered on
 * and everything smoothed through damped springs.
 *
 * `windRef` is mutated every animation frame so the R3F useFrame can read it
 * without React re-renders; `display` is throttled to ~8 fps for the debug panel.
 * `manualMph` (null = auto) overrides the speed from the debug panel.
 */
export function useWindController(manualMph: number | null): {
  windRef: WindRef;
  display: WindDisplay;
} {
  const manualRef = useRef(manualMph);
  useEffect(() => {
    manualRef.current = manualMph;
  }, [manualMph]);

  const windRef = useRef<WindState>({
    strength: 0.5,
    turbulence: 0,
    directionDelta: 0,
  });

  const [display, setDisplay] = useState<WindDisplay>({
    mode: "sim",
    stateLabel: "Active Urban",
    mph: 10,
    directionDelta: 0,
    rawData: null,
  });

  useEffect(() => {
    let api: OpenMeteoCurrent | null = null;
    let mode: WindDisplay["mode"] = "sim";
    let gust = 0;
    let nextGust = Date.now() + 3000 + Math.random() * 3000;
    let cancelled = false;

    // Damped-spring state — each value has a position and velocity.
    // Tuned for a heavy-cloth feel: low stiffness (long natural period) and overdamped so the
    // values settle without ringing. The flag lags behind wind changes the way real fabric does.
    const springs: Record<"mph" | "strength" | "turbulence" | "dirDelta", Spring> = {
      mph: { pos: 10, vel: 0, k: 3.5, c: 3.7 }, // ~3.4 s, ζ≈1.0  (display only)
      strength: { pos: 0.5, vel: 0, k: 2.0, c: 3.4 }, // ~4.4 s, ζ≈1.2  overdamped
      turbulence: { pos: 0, vel: 0, k: 1.5, c: 3.0 }, // ~5.1 s, ζ≈1.2  overdamped
      dirDelta: { pos: 0, vel: 0, k: 0.4, c: 1.6 }, // ~9.9 s, ζ≈1.3  very heavy swing
    };
    function step(s: Spring, target: number, dt: number) {
      const force = s.k * (target - s.pos) - s.c * s.vel;
      s.vel += force * dt;
      s.pos += s.vel * dt;
    }

    fetch(WIND_URL)
      .then((r) => r.json() as Promise<{ current?: OpenMeteoCurrent }>)
      .then((data) => {
        if (cancelled) return;
        api = data.current ?? null;
        mode = "live";
      })
      .catch(() => {
        mode = "sim";
      });

    let raf = 0;
    let lastTime = performance.now();
    let lastDisplayTime = 0;
    const DISPLAY_MS = 120; // ~8 fps for UI panel

    function tick() {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // ── Target mph ──────────────────────────────────────────────
      let targetMph: number;
      if (manualRef.current !== null) {
        targetMph = manualRef.current;
      } else if (api) {
        targetMph = (api.wind_speed_10m ?? 10) * KMH_TO_MPH;
      } else {
        // Simulation: diurnal × seasonal, floored to Bloomsbury minimum
        const d = new Date();
        const hour = d.getHours() + d.getMinutes() / 60;
        const month = d.getMonth() + 1;
        targetMph = Math.max(4, diurnalMph(hour) * seasonalMultiplier(month));
      }

      // ── Bloomsbury gust (4–8 mph every 3–6 s) ────────────────────
      // Suppressed in manual mode — the slider value is authoritative.
      const isManual = manualRef.current !== null;
      const nowMs = Date.now();
      if (!isManual && nowMs >= nextGust) {
        gust = 4 + Math.random() * 4;
        nextGust = nowMs + 3000 + Math.random() * 3000;
      }
      gust *= Math.pow(0.5, dt / 1.2); // half-life 1.2 s
      if (isManual || gust < 0.05) gust = 0;

      // Manual mode has no floor so users can see the flag fully limp
      const floor = isManual ? 0 : 4;
      const finalMph = Math.max(floor, targetMph + gust);

      // ── Venturi direction drift (±10°, two overlapping sin waves) ─
      const dirTarget = Math.sin(now / 9000) * 7 + Math.sin(now / 3700) * 3;

      // ── Spring step toward targets (organic overshoot/settle) ────
      step(springs.mph, finalMph, dt);
      step(springs.strength, mphToWindStrength(finalMph), dt);
      step(springs.turbulence, mphToTurbulence(finalMph), dt);
      step(springs.dirDelta, dirTarget, dt);

      // Push high-frequency values via ref (zero React overhead)
      windRef.current.strength = springs.strength.pos;
      windRef.current.turbulence = springs.turbulence.pos;
      windRef.current.directionDelta = springs.dirDelta.pos;

      // Push display values throttled
      if (now - lastDisplayTime > DISPLAY_MS) {
        lastDisplayTime = now;
        setDisplay({
          mode,
          stateLabel: mphToStateLabel(springs.mph.pos),
          mph: springs.mph.pos,
          directionDelta: springs.dirDelta.pos,
          rawData: api,
        });
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []); // refs track manualMph changes; no restart needed

  return { windRef, display };
}
