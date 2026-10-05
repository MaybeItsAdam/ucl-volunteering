"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { DebugTimePanel } from "./DebugTimePanel";
import { FlagCanvas } from "./FlagCanvas";
import { skyColors, useSunState } from "./sun";
import { useWindController } from "./useWindController";
import "./landing.css";

const D2R = Math.PI / 180;

// Tuned pose of the flag entity; the debug panel starts here and resets to it.
const INIT = {
  px: -2.11,
  py: 0.23,
  pz: -1.77,
  rx: -10.9,
  ry: -3.8,
  rz: 2.6,
  scale: 0.84,
  poleScale: 1.57,
  ballScale: 1.65,
};

function Slider({
  label,
  value,
  set,
  defaultValue,
  min,
  max,
  step,
  fmt,
}: {
  label: string;
  value: number;
  set: (v: number) => void;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}) {
  return (
    <>
      <span className="uvs-ctrl-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        aria-label={label}
      />
      <span className="uvs-debug-time-value">{fmt(value)}</span>
      <button
        type="button"
        className="uvs-ctrl-reset"
        onClick={() => set(defaultValue)}
        title="Reset"
      >
        ↺
      </button>
    </>
  );
}

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

/** Typing the Konami code toggles the debug panels (time of day, flag pose, wind). */
function useKonamiUnlock() {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    let i = 0;
    function onKey(e: KeyboardEvent) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === KONAMI[i]) {
        i += 1;
        if (i === KONAMI.length) {
          setUnlocked((u) => !u);
          i = 0;
        }
      } else {
        i = key === KONAMI[0] ? 1 : 0;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return unlocked;
}

const fixed2 = (v: number) => v.toFixed(2);
const degrees = (v: number) => `${v.toFixed(1)}°`;
const times = (v: number) => `${v.toFixed(2)}×`;

/**
 * The public front page: the society's flag flying over a sky that follows
 * the real sun and wind over Bloomsbury. `children` fills the copy column: the
 * society's name on `/`, the sign-in panel on `/auth/*`. It is the `(landing)`
 * layout, so moving between those keeps the flag flying.
 */
export function Landing({ children }: { children: ReactNode }) {
  const sun = useSunState();
  const { top, bot } = skyColors(sun.elevation);
  const isNight = sun.elevation < -0.05;
  const debugUnlocked = useKonamiUnlock();

  // Flag entity controls
  const [px, setPx] = useState(INIT.px);
  const [py, setPy] = useState(INIT.py);
  const [pz, setPz] = useState(INIT.pz);
  const [rx, setRx] = useState(INIT.rx);
  const [ry, setRy] = useState(INIT.ry);
  const [rz, setRz] = useState(INIT.rz);
  const [scale, setScale] = useState(INIT.scale);
  const [poleScale, setPoleScale] = useState(INIT.poleScale);
  const [ballScale, setBallScale] = useState(INIT.ballScale);

  // Wind — null = auto (live/sim), number = manual override in mph
  const [manualMph, setManualMph] = useState<number | null>(null);
  const { windRef, display: wind } = useWindController(manualMph);

  // User-set entity rotation. Wind direction delta is applied separately to the
  // flag pivot only, so the pole stays still while the cloth sways with the breeze.
  const flagRotation: [number, number, number] = [rx * D2R, ry * D2R, rz * D2R];
  const flagPosition: [number, number, number] = [px, py, pz];

  // The slider value tracks live wind when in auto mode
  const sliderMph = manualMph ?? wind.mph;

  const rootStyle = { "--uvs-theme-mix": isNight ? 1 : 0 } as CSSProperties;
  const heroStyle = { "--uvs-sky-top": top, "--uvs-sky-bot": bot } as CSSProperties;

  return (
    <div className="uvs" style={rootStyle}>
      <section className="uvs-hero" id="top" style={heroStyle}>
        <div className="uvs-flag-sky" aria-hidden="true" />
        <div className="uvs-hero-flag" aria-hidden="true">
          <FlagCanvas
            flagPosition={flagPosition}
            flagRotation={flagRotation}
            flagScale={scale}
            windRef={windRef}
            poleScale={poleScale}
            ballScale={ballScale}
            isDark={isNight}
          />
        </div>
        <div className="uvs-hero-copy">{children}</div>
      </section>

      {debugUnlocked && <DebugTimePanel />}

      {debugUnlocked && (
        <div className="uvs-flag-controls" role="region" aria-label="Debug flag">
          <div className="uvs-debug-time-head">
            <span className="uvs-debug-time-eyebrow">Flag Entity</span>
          </div>

          <Slider label="Pos X" value={px} set={setPx} defaultValue={INIT.px} min={-5} max={5} step={0.01} fmt={fixed2} />
          <Slider label="Pos Y" value={py} set={setPy} defaultValue={INIT.py} min={-5} max={5} step={0.01} fmt={fixed2} />
          <Slider label="Pos Z" value={pz} set={setPz} defaultValue={INIT.pz} min={-8} max={8} step={0.01} fmt={fixed2} />
          <Slider label="Rot X" value={rx} set={setRx} defaultValue={INIT.rx} min={-90} max={90} step={0.1} fmt={degrees} />
          <Slider label="Rot Y" value={ry} set={setRy} defaultValue={INIT.ry} min={-180} max={180} step={0.1} fmt={degrees} />
          <Slider label="Rot Z" value={rz} set={setRz} defaultValue={INIT.rz} min={-90} max={90} step={0.1} fmt={degrees} />
          <Slider label="Scale" value={scale} set={setScale} defaultValue={INIT.scale} min={0.1} max={4} step={0.01} fmt={times} />
          <Slider label="Pole" value={poleScale} set={setPoleScale} defaultValue={INIT.poleScale} min={0} max={5} step={0.01} fmt={times} />
          <Slider label="Ball" value={ballScale} set={setBallScale} defaultValue={INIT.ballScale} min={0} max={5} step={0.01} fmt={times} />

          <div className="uvs-ctrl-divider" />
          <div className="uvs-wind-header">
            <span className="uvs-debug-time-eyebrow">Wind</span>
            <span className={`uvs-wind-mode uvs-wind-mode--${wind.mode}`}>
              {wind.mode.toUpperCase()}
            </span>
            <span className="uvs-wind-state">{wind.stateLabel}</span>
          </div>

          {/* Wind speed slider (auto tracks live, drag to override) */}
          <span className="uvs-ctrl-label">Speed</span>
          <input
            type="range"
            min={0}
            max={45}
            step={0.5}
            value={sliderMph}
            onChange={(e) => setManualMph(Number(e.target.value))}
            aria-label="Wind speed"
          />
          <span className="uvs-debug-time-value">{sliderMph.toFixed(1)} mph</span>
          <button
            type="button"
            className="uvs-ctrl-reset"
            onClick={() => setManualMph(null)}
            title={manualMph === null ? "Auto mode" : "Reset to auto"}
          >
            {manualMph === null ? "~" : "↺"}
          </button>
        </div>
      )}
    </div>
  );
}
