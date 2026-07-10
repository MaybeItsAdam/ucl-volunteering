import { useEffect, useState } from "react"
import { api } from "./api"

const MAX_PAGES = 5

async function fetchAllOpportunities() {
  const first = await api.getOpportunities()
  let opps = first.opportunities || []
  const totalPages = Math.min(first.totalPages || 1, MAX_PAGES)
  for (let page = 2; page <= totalPages; page++) {
    const d = await api.getOpportunities({ page })
    opps = opps.concat(d.opportunities || [])
  }
  const seen = new Set()
  return opps.filter((o) => {
    if (seen.has(o.id)) return false
    seen.add(o.id)
    return true
  })
}

export function useAllOpportunities() {
  const [opportunities, setOpportunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchAllOpportunities()
      .then((opps) => {
        if (cancelled) return
        setOpportunities(opps)
        setError(null)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { opportunities, loading, error }
}
