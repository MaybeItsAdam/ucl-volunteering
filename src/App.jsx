import { useCallback, useEffect, useRef, useState } from "react"
import VolunteeringWebsite from "./VolunteeringWebsite"
import Dashboard from "./Dashboard"
import { setToken } from "./auth"

function readRoute() {
  const hash = window.location.hash
  if (hash.startsWith("#token=")) {
    // OAuth callback — consume token before routing
    setToken(hash.slice("#token=".length))
    window.history.replaceState(null, "", window.location.pathname + window.location.search + "#/map")
    return "map"
  }
  if (hash.startsWith("#/map") || hash.startsWith("#/dashboard")) return "map"
  if (hash.startsWith("#/upcoming")) return "upcoming"
  if (hash.startsWith("#/directory") || hash.startsWith("#/opportunities")) return "directory"
  return "home"
}

const ROUTE_TO_TAB = {
  map: "map",
  upcoming: "upcoming",
  directory: "directory",
}

// Page-wipe choreography
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
    const targetRoute = (() => {
      if (target.startsWith("#/map") || target.startsWith("#/dashboard")) return "map"
      if (target.startsWith("#/upcoming")) return "upcoming"
      if (target.startsWith("#/directory") || target.startsWith("#/opportunities")) return "directory"
      return "home"
    })()
    const animated = targetRoute === "home" || route === "home"
    if (!animated) {
      window.location.hash = target
      setRoute(readRoute())
      return
    }
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
  }, [phase, route])

  const isDashboardRoute = route !== "home"

  return (
    <>
      {route === "home" && <VolunteeringWebsite onNavigate={navigateTo} />}
      {isDashboardRoute && (
        <Dashboard
          tab={ROUTE_TO_TAB[route]}
          onNavigate={navigateTo}
        />
      )}

      <div
        className={`uvs-page-wipe uvs-page-wipe--${phase}`}
        aria-hidden="true"
      />
    </>
  )
}

export default App
