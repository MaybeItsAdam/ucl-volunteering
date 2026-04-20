import { useEffect, useState } from "react"
import VolunteeringWebsite from "./VolunteeringWebsite"

function getCurrentView() {
  return window.location.pathname.startsWith("/dashboard") ? "dashboard" : "home"
}

function App() {
  const [view, setView] = useState(getCurrentView)

  useEffect(() => {
    const handlePopState = () => setView(getCurrentView())
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const navigateToView = (nextView) => {
    const nextPath = nextView === "dashboard" ? "/dashboard" : "/"
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath)
    }
    setView(nextView)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return <VolunteeringWebsite activeView={view} onNavigate={navigateToView} />
}

export default App
