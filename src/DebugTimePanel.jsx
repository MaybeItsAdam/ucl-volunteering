import {
  clearTimeOverride,
  getEffectiveDate,
  setTimeOverride,
  useTimeOverride
} from "./timeOverride"

function formatHour(hour) {
  const h = Math.floor(hour) % 24
  const m = Math.round((hour - Math.floor(hour)) * 60) % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export default function DebugTimePanel() {
  const override = useTimeOverride()
  const live = override == null
  const liveDate = getEffectiveDate()
  const liveHour = liveDate.getHours() + liveDate.getMinutes() / 60
  const sliderValue = override ?? liveHour
  const label = live ? `live · ${formatHour(liveHour)}` : formatHour(override)

  return (
    <div className="uvs-debug-time" role="region" aria-label="Debug time">
      <div className="uvs-debug-time-head">
        <span className="uvs-debug-time-eyebrow">Time</span>
        <span className="uvs-debug-time-value">{label}</span>
      </div>
      <input
        type="range"
        min={0}
        max={24}
        step={0.25}
        value={sliderValue}
        onChange={(e) => setTimeOverride(parseFloat(e.target.value))}
        aria-label="Set time of day"
      />
      <button
        type="button"
        onClick={clearTimeOverride}
        disabled={live}
        className="uvs-debug-time-reset"
      >
        live
      </button>
    </div>
  )
}
