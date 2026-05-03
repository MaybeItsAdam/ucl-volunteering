import { useCallback, useEffect, useRef, useState } from "react"
import VolunteeringWebsite from "./VolunteeringWebsite"
import Dashboard from "./Dashboard"

function readRoute() {
  return window.location.hash.startsWith("#/dashboard") ? "dashboard" : "home"
}

// Page-wipe choreography
//   idle      → linen sheet parked off-screen below
//   rising    → sheet slides up to fully cover the viewport (route swaps at the top)
//   revealing → sheet continues sliding off the top, exposing the new page
const RISE_MS = 520
const REVEAL_MS = 560

function App() {
  const [route, setRoute] = useState(readRoute)
  const [phase, setPhase] = useState("idle")
  const timers = useRef([])

  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  useEffect(
    () => () => timers.current.forEach((id) => clearTimeout(id)),
    []
  )

  const navigateTo = useCallback((target) => {
    if (phase !== "idle") return
    setPhase("rising")
    timers.current.push(
      setTimeout(() => {
        window.location.hash = target
        setRoute(readRoute())
        setPhase("revealing")
        timers.current.push(
          setTimeout(() => setPhase("idle"), REVEAL_MS)
        )
      }, RISE_MS)
    )
  }, [phase])

  return (
    <>
      {route === "dashboard"
        ? <Dashboard onNavigate={navigateTo} />
        : <VolunteeringWebsite onNavigate={navigateTo} />}
      <div
        className={`uvs-page-wipe uvs-page-wipe--${phase}`}
        aria-hidden="true"
      />
    </>
  )
}

export default App
