import React, { useEffect, useState } from "react"
import VolSocHand from "./VolSocHand"
import UclFlag, { useSunState, skyColors } from "./UclFlag"
import DebugTimePanel from "./DebugTimePanel"
import "./volunteeringWebsite.css"

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

const WIND_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=51.5223&longitude=-0.1259" +
  "&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m"

const CARDINALS = ["N","NE","E","SE","S","SW","W","NW"]
function windCardinal(deg) {
  return CARDINALS[Math.round(deg / 45) % 8]
}
function windToStrength(kmh) {
  // 0 km/h → 0.1 (barely moves), 30 km/h → 1.0, 60+ km/h → 2.0
  return Math.max(0.1, Math.min(kmh / 30, 2))
}

const INIT = {
  px: 0, py: 0, pz: 0,
  rx: +(0.08 * R2D).toFixed(1),
  ry: +(0.48 * R2D).toFixed(1),
  rz: 0,
  scale: 1,
  poleScale: 1,
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
      <button
        className="uvs-ctrl-reset"
        onClick={() => set(defaultValue)}
        title="Reset"
      >↺</button>
    </>
  )
}

function nightMix(elevation) {
  return elevation < -0.05 ? 1 : 0
}

export default function VolunteeringWebsite() {
  const sun = useSunState()
  const { top, bot } = skyColors(sun.elevation)
  const themeMix = nightMix(sun.elevation)

  // flag entity state
  const [px, setPx] = useState(INIT.px)
  const [py, setPy] = useState(INIT.py)
  const [pz, setPz] = useState(INIT.pz)
  const [rx, setRx] = useState(INIT.rx)
  const [ry, setRy] = useState(INIT.ry)
  const [rz, setRz] = useState(INIT.rz)
  const [scale, setScale] = useState(INIT.scale)
  const [poleScale, setPoleScale] = useState(INIT.poleScale)

  // wind — fetched once; drives initial windStrength (user can then override)
  const [windData, setWindData] = useState(null)
  const [windStrength, setWindStrength] = useState(1)
  const [apiWindStrength, setApiWindStrength] = useState(1)

  useEffect(() => {
    fetch(WIND_URL)
      .then(r => r.json())
      .then(data => {
        const c = data.current ?? {}
        setWindData(c)
        const s = windToStrength(c.wind_speed_10m ?? 10)
        setWindStrength(s)
        setApiWindStrength(s)
      })
      .catch(() => {})
  }, [])

  const flagPosition = [px, py, pz]
  const flagRotation = [rx * D2R, ry * D2R, rz * D2R]

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
            windStrength={windStrength}
            poleScale={poleScale}
          />
        </div>
        <div className="uvs-hero-copy">
          <VolSocHand className="uvs-hero-logo" />
          <h1>UCL Volunteering Society</h1>
          <p className="uvs-lede">
            We connect UCL students with volunteering opportunities across London —
            student-led, group-led, and external. Weekly, one-off, or whenever you can.
          </p>
          <div className="uvs-cta-row">
            <a className="uvs-cta uvs-cta-primary" href="#/dashboard">
              Browse opportunities →
            </a>
          </div>
        </div>
      </section>

      <DebugTimePanel />

      <div className="uvs-flag-controls">
        <div className="uvs-debug-time-head">
          <span className="uvs-debug-time-eyebrow">Flag Entity</span>
        </div>

        {windData && (
          <div className="uvs-wind-readout">
            {windData.wind_speed_10m?.toFixed(0)} km/h {windCardinal(windData.wind_direction_10m)}
            {" · "}gusts {windData.wind_gusts_10m?.toFixed(0)} km/h
          </div>
        )}

        <Slider label="Pos X"  value={px}          set={setPx}          defaultValue={INIT.px}        min={-5}   max={5}   step={0.01} fmt={v => v.toFixed(2)} />
        <Slider label="Pos Y"  value={py}          set={setPy}          defaultValue={INIT.py}        min={-5}   max={5}   step={0.01} fmt={v => v.toFixed(2)} />
        <Slider label="Pos Z"  value={pz}          set={setPz}          defaultValue={INIT.pz}        min={-8}   max={8}   step={0.01} fmt={v => v.toFixed(2)} />
        <Slider label="Rot X"  value={rx}          set={setRx}          defaultValue={INIT.rx}        min={-90}  max={90}  step={0.1}  fmt={v => v.toFixed(1) + "°"} />
        <Slider label="Rot Y"  value={ry}          set={setRy}          defaultValue={INIT.ry}        min={-180} max={180} step={0.1}  fmt={v => v.toFixed(1) + "°"} />
        <Slider label="Rot Z"  value={rz}          set={setRz}          defaultValue={INIT.rz}        min={-90}  max={90}  step={0.1}  fmt={v => v.toFixed(1) + "°"} />
        <Slider label="Scale"  value={scale}       set={setScale}       defaultValue={INIT.scale}     min={0.1}  max={4}   step={0.01} fmt={v => v.toFixed(2) + "×"} />
        <Slider label="Pole"   value={poleScale}   set={setPoleScale}   defaultValue={INIT.poleScale} min={0}    max={5}   step={0.01} fmt={v => v.toFixed(2) + "×"} />
        <Slider label="Wind"   value={windStrength} set={setWindStrength} defaultValue={apiWindStrength} min={0} max={2}  step={0.01} fmt={v => v.toFixed(2) + "×"} />
      </div>
    </div>
  )
}
