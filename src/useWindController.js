import { useEffect, useRef, useState } from "react"

const WIND_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=51.5223&longitude=-0.1259" +
  "&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m"

const KMH_TO_MPH = 0.621371

// Diurnal base: peak 14 mph at 16:00, trough 5 mph at 04:00
function diurnalMph(hour) {
  return 9.5 + 4.5 * Math.cos((2 * Math.PI * (hour - 16)) / 24)
}

// Seasonal multiplier: 1.2× January, 0.8× July
function seasonalMultiplier(month) {
  return 1.0 + 0.2 * Math.cos((2 * Math.PI * (month - 1)) / 12)
}

function mphToWindStrength(mph) {
  if (mph <= 0)  return 0
  if (mph <= 4)  return 0.025 * mph
  if (mph <= 14) return 0.15 + ((mph - 4)  / 10) * 0.85  // 0.15 → 1.0
  if (mph <= 23) return 1.0  + ((mph - 14) / 9)  * 0.6   // 1.0  → 1.6
  return Math.min(2.0, 1.6 + ((mph - 23) / 10) * 0.4)    // 1.6  → 2.0
}

function mphToTurbulence(mph) {
  if (mph <= 7)  return Math.max(0, (mph - 4) / 3) * 0.1
  if (mph <= 14) return 0.1 + ((mph - 7)  / 7) * 0.3
  if (mph <= 22) return 0.4 + ((mph - 14) / 8) * 0.4
  return Math.min(1.0, 0.8 + ((mph - 22) / 8) * 0.2)
}

export function mphToStateLabel(mph) {
  if (mph < 8)  return "Idle Lull"
  if (mph < 15) return "Active Urban"
  if (mph < 23) return "Gust Peak"
  return "Storm State"
}

// Exposed as a ref so the R3F useFrame can read it without React re-renders
// shape: { strength: number, turbulence: number }
// Display state (throttled ~8 fps) carries mph, directionDelta, mode, stateLabel

export function useWindController(manualMph) {
  const manualRef = useRef(manualMph)
  useEffect(() => { manualRef.current = manualMph }, [manualMph])

  // High-frequency values read directly by the shader in useFrame
  const windRef = useRef({ strength: 0.5, turbulence: 0, directionDelta: 0 })

  const [display, setDisplay] = useState({
    mode: "sim",
    stateLabel: "Active Urban",
    mph: 10,
    directionDelta: 0,
    rawData: null,
  })

  useEffect(() => {
    const apiRef    = { current: null }
    const modeRef   = { current: "sim" }
    const gustRef   = { current: 0 }
    const nextGust  = { current: Date.now() + 3000 + Math.random() * 3000 }

    // Damped-spring state — each value has a position and velocity.
    // Tuned for a heavy-cloth feel: low stiffness (long natural period) and overdamped so the
    // values settle without ringing. The flag lags behind wind changes the way real fabric does.
    const springs = {
      mph:        { pos: 10,  vel: 0, k: 3.5, c: 3.7 }, // ~3.4 s, ζ≈1.0  (display only)
      strength:   { pos: 0.5, vel: 0, k: 2.0, c: 3.4 }, // ~4.4 s, ζ≈1.2  overdamped
      turbulence: { pos: 0,   vel: 0, k: 1.5, c: 3.0 }, // ~5.1 s, ζ≈1.2  overdamped
      dirDelta:   { pos: 0,   vel: 0, k: 0.4, c: 1.6 }, // ~9.9 s, ζ≈1.3  very heavy swing
    }
    function step(s, target, dt) {
      const force = s.k * (target - s.pos) - s.c * s.vel
      s.vel += force * dt
      s.pos += s.vel * dt
    }

    fetch(WIND_URL)
      .then(r => r.json())
      .then(data => {
        apiRef.current = data.current ?? null
        modeRef.current = "live"
      })
      .catch(() => { modeRef.current = "sim" })

    let raf
    let lastTime = performance.now()
    let lastDisplayTime = 0
    const DISPLAY_MS = 120 // ~8 fps for UI panel

    function tick() {
      const now  = performance.now()
      const dt   = Math.min((now - lastTime) / 1000, 0.1)
      lastTime   = now

      // ── Target mph ────────────────────────────���──────────────────
      let targetMph
      if (manualRef.current !== null) {
        targetMph = manualRef.current
      } else if (apiRef.current) {
        targetMph = (apiRef.current.wind_speed_10m ?? 10) * KMH_TO_MPH
      } else {
        // Simulation: diurnal × seasonal, floored to Bloomsbury minimum
        const d     = new Date()
        const hour  = d.getHours() + d.getMinutes() / 60
        const month = d.getMonth() + 1
        targetMph   = Math.max(4, diurnalMph(hour) * seasonalMultiplier(month))
      }

      // ── Bloomsbury gust (4–8 mph every 3–6 s) ────────────────────
      // Suppressed in manual mode — the slider value is authoritative.
      const isManual = manualRef.current !== null
      const nowMs = Date.now()
      if (!isManual && nowMs >= nextGust.current) {
        gustRef.current   = 4 + Math.random() * 4
        nextGust.current  = nowMs + 3000 + Math.random() * 3000
      }
      gustRef.current *= Math.pow(0.5, dt / 1.2) // half-life 1.2 s
      if (isManual || gustRef.current < 0.05) gustRef.current = 0

      // Manual mode has no floor so users can see the flag fully limp
      const floor    = isManual ? 0 : 4
      const finalMph = Math.max(floor, targetMph + gustRef.current)

      // ── Venturi direction drift (±10°, two overlapping sin waves) ─
      const dirTarget =
        Math.sin(now / 9000) * 7 +
        Math.sin(now / 3700) * 3

      // ── Spring step toward targets (organic overshoot/settle) ────
      step(springs.mph,        finalMph,                          dt)
      step(springs.strength,   mphToWindStrength(finalMph),       dt)
      step(springs.turbulence, mphToTurbulence(finalMph),          dt)
      step(springs.dirDelta,   dirTarget,                          dt)

      // Push high-frequency values via ref (zero React overhead)
      windRef.current.strength       = springs.strength.pos
      windRef.current.turbulence     = springs.turbulence.pos
      windRef.current.directionDelta = springs.dirDelta.pos

      // Push display values throttled
      if (now - lastDisplayTime > DISPLAY_MS) {
        lastDisplayTime = now
        setDisplay({
          mode:           modeRef.current,
          stateLabel:     mphToStateLabel(springs.mph.pos),
          mph:            springs.mph.pos,
          directionDelta: springs.dirDelta.pos,
          rawData:        apiRef.current,
        })
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, []) // refs track manualMph changes; no restart needed

  return { windRef, display }
}
