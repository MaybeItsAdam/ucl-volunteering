import { useEffect, useState } from "react"
import VolunteeringWebsite from "./VolunteeringWebsite"
import Dashboard from "./Dashboard"

function readRoute() {
  return window.location.hash.startsWith("#/dashboard") ? "dashboard" : "home"
}

function App() {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  return route === "dashboard" ? <Dashboard /> : <VolunteeringWebsite />
}

export default App
