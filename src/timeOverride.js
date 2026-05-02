import { useSyncExternalStore } from "react"

let overrideHour = null
const listeners = new Set()

const subscribe = (cb) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
const getSnapshot = () => overrideHour
const getServerSnapshot = () => null

function emit() {
  for (const l of listeners) l()
}

export function setTimeOverride(hour) {
  overrideHour = hour
  emit()
}

export function clearTimeOverride() {
  overrideHour = null
  emit()
}

export function useTimeOverride() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function getEffectiveDate() {
  if (overrideHour == null) return new Date()
  const d = new Date()
  const wholeHour = Math.floor(overrideHour)
  const minutes = Math.round((overrideHour - wholeHour) * 60)
  d.setHours(wholeHour, minutes, 0, 0)
  return d
}
