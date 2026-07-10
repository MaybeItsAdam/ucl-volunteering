import React, { useEffect, useState } from "react"
import VolSocHand from "./VolSocHand"
import UclFlag, { useSunState, skyColors } from "./UclFlag"
import DebugTimePanel from "./DebugTimePanel"
import { useWindController } from "./useWindController"
import "./volunteeringWebsite.css"

const D2R = Math.PI / 180

const INIT = {
  px: -2.11, py: 0.23, pz: -1.77,
  rx: -10.9,
  ry: -3.8,
  rz: 2.6,
  scale: 0.84,
  poleScale: 1.57,
  ballScale: 1.65,
}

function Slider({ label, value, set, defaultValue, min, max, step, fmt }) {
  return (
    <>
      <span className="uvs-ctrl-label">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => set(Number(e.target.value))}
      />
      <span className="uvs-debug-time-value">{fmt(value)}</span>
      <button className="uvs-ctrl-reset" onClick={() => set(defaultValue)} title="Reset">↺</button>
    </>
  )
}

function nightMix(elevation) {
  return elevation < -0.05 ? 1 : 0
}

const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
]

function useKonamiUnlock() {
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => {
    let i = 0
    function onKey(e) {
      const expected = KONAMI[i]
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (key === expected) {
        i += 1
        if (i === KONAMI.length) {
          setUnlocked(u => !u)
          i = 0
        }
      } else {
        i = key === KONAMI[0] ? 1 : 0
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  return unlocked
}

export default function VolunteeringWebsite({ onNavigate }) {
  const sun = useSunState()
  const { top, bot } = skyColors(sun.elevation)
  const themeMix = nightMix(sun.elevation)
  const debugUnlocked = useKonamiUnlock()

  // Flag entity controls
  const [px, setPx] = useState(INIT.px)
  const [py, setPy] = useState(INIT.py)
  const [pz, setPz] = useState(INIT.pz)
  const [rx, setRx] = useState(INIT.rx)
  const [ry, setRy] = useState(INIT.ry)
  const [rz, setRz] = useState(INIT.rz)
  const [scale, setScale] = useState(INIT.scale)
  const [poleScale, setPoleScale] = useState(INIT.poleScale)
  const [ballScale, setBallScale] = useState(INIT.ballScale)

  // Wind — null = auto (live/sim), number = manual override in mph
  const [manualMph, setManualMph] = useState(null)
  const { windRef, display: wind } = useWindController(manualMph)

  // User-set entity rotation. Wind direction delta is applied separately to the flag pivot only,
  // so the pole stays still while the cloth sways with the breeze.
  const flagRotation = [rx * D2R, ry * D2R, rz * D2R]
  const flagPosition = [px, py, pz]

  // The slider value tracks live wind when in auto mode
  const sliderMph = manualMph ?? wind.mph

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--theme-mix", String(themeMix))
    return () => root.style.removeProperty("--theme-mix")
  }, [themeMix])

  return (
    <div className="uvs">
      <section
        className="uvs-hero"
        id="top"
        style={{ "--sky-top": top, "--sky-bot": bot }}
      >
        <div className="uvs-flag-sky" aria-hidden="true" />
        <div className="uvs-hero-flag" aria-hidden="true">
          <UclFlag
            flagPosition={flagPosition}
            flagRotation={flagRotation}
            flagScale={scale}
            windRef={windRef}
            poleScale={poleScale}
            ballScale={ballScale}
            isDark={themeMix === 1}
          />
        </div>
        <div className="uvs-hero-copy">
          <VolSocHand className="uvs-hero-logo" />
          <h1>UCL Volunteering Society</h1>
          <div className="uvs-cta-row">
            <a
              className="uvs-cta uvs-cta-primary"
              href="#/map"
              onClick={(e) => {
                if (onNavigate) {
                  e.preventDefault()
                  onNavigate("#/map")
                }
              }}
            >
              Browse opportunities →
            </a>
            <a
              className="uvs-cta uvs-cta-secondary"
              href="#/upcoming"
              onClick={(e) => {
                if (onNavigate) {
                  e.preventDefault()
                  onNavigate("#/upcoming")
                }
              }}
            >
              What's coming up
            </a>
          </div>
        </div>
      </section>

      {debugUnlocked && <DebugTimePanel />}

      {debugUnlocked && <div className="uvs-flag-controls">
        {/* ── Entity header ── */}
        <div className="uvs-debug-time-head">
          <span className="uvs-debug-time-eyebrow">Flag Entity</span>
        </div>

        <Slider label="Pos X"  value={px}        set={setPx}        defaultValue={INIT.px}        min={-5}   max={5}   step={0.01} fmt={v => v.toFixed(2)} />
        <Slider label="Pos Y"  value={py}        set={setPy}        defaultValue={INIT.py}        min={-5}   max={5}   step={0.01} fmt={v => v.toFixed(2)} />
        <Slider label="Pos Z"  value={pz}        set={setPz}        defaultValue={INIT.pz}        min={-8}   max={8}   step={0.01} fmt={v => v.toFixed(2)} />
        <Slider label="Rot X"  value={rx}        set={setRx}        defaultValue={INIT.rx}        min={-90}  max={90}  step={0.1}  fmt={v => v.toFixed(1) + "°"} />
        <Slider label="Rot Y"  value={ry}        set={setRy}        defaultValue={INIT.ry}        min={-180} max={180} step={0.1}  fmt={v => v.toFixed(1) + "°"} />
        <Slider label="Rot Z"  value={rz}        set={setRz}        defaultValue={INIT.rz}        min={-90}  max={90}  step={0.1}  fmt={v => v.toFixed(1) + "°"} />
        <Slider label="Scale"  value={scale}     set={setScale}     defaultValue={INIT.scale}     min={0.1}  max={4}   step={0.01} fmt={v => v.toFixed(2) + "×"} />
        <Slider label="Pole"   value={poleScale} set={setPoleScale} defaultValue={INIT.poleScale} min={0}    max={5}   step={0.01} fmt={v => v.toFixed(2) + "×"} />
        <Slider label="Ball"   value={ballScale} set={setBallScale} defaultValue={INIT.ballScale} min={0}    max={5}   step={0.01} fmt={v => v.toFixed(2) + "×"} />

        {/* ── Wind divider + header ── */}
        <div className="uvs-ctrl-divider" />
        <div className="uvs-wind-header">
          <span className="uvs-debug-time-eyebrow">Wind</span>
          <span className={`uvs-wind-mode uvs-wind-mode--${wind.mode}`}>
            {wind.mode.toUpperCase()}
          </span>
          <span className="uvs-wind-state">{wind.stateLabel}</span>
        </div>

        {/* ── Wind speed slider (auto tracks live, drag to override) ── */}
        <span className="uvs-ctrl-label">Speed</span>
        <input
          type="range"
          min={0} max={45} step={0.5}
          value={sliderMph}
          onChange={e => setManualMph(Number(e.target.value))}
        />
        <span className="uvs-debug-time-value">
          {sliderMph.toFixed(1)} mph
        </span>
        <button
          className="uvs-ctrl-reset"
          onClick={() => setManualMph(null)}
          title={manualMph === null ? "Auto mode" : "Reset to auto"}
        >
          {manualMph === null ? "~" : "↺"}
        </button>
      </div>}
    </div>
  )
}
