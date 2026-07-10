import React, { useEffect, useMemo, useRef, useState } from "react"
import { motion as Motion } from "motion/react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { api } from "./api"

const UCL_CENTRE = [51.5246, -0.134]
const MAX_PAGES = 5

// Rough coordinates for locations that commonly appear as free-text on
// opportunities, so they can be plotted without a geocoding service.
const LONDON_PLACES = {
  ucl: [51.5246, -0.134],
  bloomsbury: [51.5222, -0.1276],
  "kings cross": [51.5308, -0.1238],
  "king's cross": [51.5308, -0.1238],
  euston: [51.5282, -0.1337],
  fitzrovia: [51.5187, -0.1381],
  camden: [51.539, -0.1426],
  "kentish town": [51.5504, -0.1407],
  islington: [51.5362, -0.103],
  angel: [51.5322, -0.1058],
  holborn: [51.5174, -0.12],
  "covent garden": [51.5117, -0.124],
  soho: [51.5137, -0.1337],
  westminster: [51.4995, -0.1273],
  victoria: [51.4965, -0.1447],
  marylebone: [51.5186, -0.1509],
  paddington: [51.5154, -0.1755],
  "notting hill": [51.5091, -0.1961],
  kensington: [51.499, -0.1932],
  chelsea: [51.4875, -0.1687],
  hammersmith: [51.4927, -0.2229],
  ealing: [51.5131, -0.3049],
  wembley: [51.5524, -0.2969],
  kilburn: [51.5471, -0.2043],
  hampstead: [51.5566, -0.178],
  highgate: [51.5716, -0.1461],
  archway: [51.5654, -0.1348],
  "finsbury park": [51.5642, -0.1063],
  tottenham: [51.5882, -0.0723],
  hackney: [51.5450, -0.0553],
  dalston: [51.546, -0.0754],
  "stoke newington": [51.5623, -0.0743],
  shoreditch: [51.5245, -0.0786],
  "bethnal green": [51.5273, -0.0554],
  whitechapel: [51.5194, -0.0612],
  "mile end": [51.5249, -0.0332],
  bow: [51.5277, -0.0204],
  stratford: [51.5416, -0.0032],
  "canary wharf": [51.5054, -0.0235],
  greenwich: [51.4826, -0.0077],
  deptford: [51.479, -0.0262],
  lewisham: [51.4643, -0.0129],
  peckham: [51.4739, -0.0685],
  brixton: [51.4627, -0.1145],
  clapham: [51.4618, -0.138],
  battersea: [51.4708, -0.1621],
  wandsworth: [51.457, -0.1927],
  vauxhall: [51.4861, -0.1229],
  waterloo: [51.5031, -0.1132],
  "london bridge": [51.505, -0.0864],
  borough: [51.5011, -0.0932],
  southwark: [51.5035, -0.1044],
  "elephant and castle": [51.4943, -0.1005],
  croydon: [51.3728, -0.1004],
  "central london": [51.5155, -0.1273],
  "north london": [51.565, -0.12],
  "east london": [51.53, -0.04],
  "south london": [51.46, -0.11],
  "west london": [51.5, -0.22],
}

const REMOTE_HINTS = ["online", "remote", "virtual", "from home", "anywhere"]

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c])
}

function locateOpportunity(opp) {
  const lat = Number(opp.latitude ?? opp.lat)
  const lng = Number(opp.longitude ?? opp.lng ?? opp.lon)
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return { key: `${lat},${lng}`, label: opp.location || opp.title, coords: [lat, lng] }
  }
  const loc = (opp.location || "").toLowerCase()
  if (!loc) return null
  if (REMOTE_HINTS.some((hint) => loc.includes(hint))) return { remote: true }
  for (const [place, coords] of Object.entries(LONDON_PLACES)) {
    if (loc.includes(place)) {
      const label = place === "ucl"
        ? "UCL"
        : place.replace(/\b\w/g, (ch) => ch.toUpperCase())
      return { key: place, label, coords }
    }
  }
  return null
}

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

function popupHtml(group) {
  const items = group.opps
    .slice(0, 6)
    .map((opp) => {
      const org = opp.organisation ? ` — ${escapeHtml(opp.organisation)}` : ""
      return `<li>${escapeHtml(opp.title)}${org}</li>`
    })
    .join("")
  const more = group.opps.length > 6
    ? `<li>…and ${group.opps.length - 6} more</li>`
    : ""
  return (
    `<div class="uvs-map-popup">` +
    `<strong>${escapeHtml(group.label)}</strong>` +
    `<ul>${items}${more}</ul>` +
    `<a href="#/opportunities">Browse opportunities →</a>` +
    `</div>`
  )
}

function OpportunityMap({ groups, remoteCount, unplacedCount }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(null)

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = L.map(containerRef.current, { scrollWheelZoom: false })
    map.setView(UCL_CENTRE, 12)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (markersRef.current) markersRef.current.remove()
    const layer = L.layerGroup()
    for (const group of groups) {
      const icon = L.divIcon({
        className: "uvs-map-pin-anchor",
        html: `<span class="uvs-map-pin">${group.opps.length > 1 ? group.opps.length : ""}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      layer.addLayer(
        L.marker(group.coords, { icon, title: group.label }).bindPopup(popupHtml(group))
      )
    }
    layer.addTo(map)
    markersRef.current = layer
    if (groups.length > 0) {
      const bounds = L.latLngBounds(groups.map((g) => g.coords)).pad(0.25)
      map.fitBounds(bounds, { maxZoom: 14 })
    }
  }, [groups])

  return (
    <>
      <div className="uvs-map-canvas" ref={containerRef} aria-label="Map of volunteering opportunities" />
      <p className="uvs-map-note">
        {groups.length > 0
          ? `${groups.reduce((n, g) => n + g.opps.length, 0)} opportunit${groups.reduce((n, g) => n + g.opps.length, 0) === 1 ? "y" : "ies"} plotted across ${groups.length} location${groups.length === 1 ? "" : "s"}`
          : "No opportunities with a recognised location yet"}
        {remoteCount > 0 && ` · ${remoteCount} remote`}
        {unplacedCount > 0 && ` · ${unplacedCount} without a mappable location`}
      </p>
    </>
  )
}

function daysUntil(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(23, 59, 59, 999)
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

function deadlineLabel(days) {
  if (days <= 0) return "Closes today"
  if (days === 1) return "1 day left"
  return `${days} days left`
}

function UpcomingPanel({ opportunities, onBrowse }) {
  const closingSoon = useMemo(() => {
    return opportunities
      .map((opp) => ({ opp, days: opp.expiryDate ? daysUntil(opp.expiryDate) : null }))
      .filter((x) => x.days !== null && x.days >= 0)
      .sort((a, b) => a.days - b.days)
      .slice(0, 6)
  }, [opportunities])

  const recentlyAdded = useMemo(() => {
    const closingIds = new Set(closingSoon.map((x) => x.opp.id))
    return opportunities
      .filter((opp) => opp.setDate && !closingIds.has(opp.id))
      .sort((a, b) => new Date(b.setDate) - new Date(a.setDate))
      .slice(0, 4)
  }, [opportunities, closingSoon])

  return (
    <>
      {closingSoon.length === 0 && recentlyAdded.length === 0 && (
        <p className="uvs-empty uvs-empty--compact">Nothing on the horizon yet — check back soon</p>
      )}

      {closingSoon.length > 0 && (
        <div className="uvs-upcoming-group">
          <p className="uvs-upcoming-group-label">Closing soon</p>
          <div className="uvs-my-vol-list">
            {closingSoon.map(({ opp, days }, i) => (
              <Motion.button
                type="button"
                key={opp.id}
                className="uvs-my-vol-row uvs-upcoming-row"
                onClick={onBrowse}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.02 * i, duration: 0.28 }}
              >
                <div className="uvs-my-vol-row-info">
                  <span className="uvs-my-vol-row-name">{opp.title}</span>
                  {(opp.organisation || opp.location) && (
                    <span className="uvs-my-vol-row-notes">
                      {[opp.organisation, opp.location].filter(Boolean).join(" • ")}
                    </span>
                  )}
                </div>
                <span className={`uvs-deadline-chip${days <= 3 ? " uvs-deadline-chip--urgent" : ""}`}>
                  {deadlineLabel(days)}
                </span>
              </Motion.button>
            ))}
          </div>
        </div>
      )}

      {recentlyAdded.length > 0 && (
        <div className="uvs-upcoming-group">
          <p className="uvs-upcoming-group-label">Recently added</p>
          <div className="uvs-my-vol-list">
            {recentlyAdded.map((opp, i) => (
              <Motion.button
                type="button"
                key={opp.id}
                className="uvs-my-vol-row uvs-upcoming-row"
                onClick={onBrowse}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.02 * i, duration: 0.28 }}
              >
                <div className="uvs-my-vol-row-info">
                  <span className="uvs-my-vol-row-name">{opp.title}</span>
                  {(opp.organisation || opp.location) && (
                    <span className="uvs-my-vol-row-notes">
                      {[opp.organisation, opp.location].filter(Boolean).join(" • ")}
                    </span>
                  )}
                </div>
                <span className="uvs-my-vol-row-date">
                  {new Date(opp.setDate).toLocaleDateString()}
                </span>
              </Motion.button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function externalUrl(opps) {
  const opp = opps.find((o) => o.sourceUrl && !o.sourceUrl.startsWith("internal://"))
  return opp?.sourceUrl
}

function DirectoryPanel({ opportunities }) {
  const [query, setQuery] = useState("")

  const organisations = useMemo(() => {
    const byOrg = new Map()
    for (const opp of opportunities) {
      const name = (opp.organisation || "").trim() || "Independent opportunities"
      if (!byOrg.has(name)) byOrg.set(name, [])
      byOrg.get(name).push(opp)
    }
    return [...byOrg.entries()]
      .map(([name, opps]) => ({
        name,
        opps,
        causes: [...new Set(opps.flatMap((o) => o.causes || []))],
        url: externalUrl(opps),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [opportunities])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return organisations
    return organisations.filter(
      (org) =>
        org.name.toLowerCase().includes(q) ||
        org.causes.some((c) => c.replace(/_/g, " ").includes(q))
    )
  }, [organisations, query])

  return (
    <>
      <label className="uvs-search uvs-dir-search">
        <span className="uvs-sr">Search the directory</span>
        <input
          type="search"
          placeholder="Search organisations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {filtered.length === 0 && (
        <p className="uvs-empty uvs-empty--compact">
          {organisations.length === 0
            ? "No organisations listed yet"
            : "No organisations match your search"}
        </p>
      )}

      <div className="uvs-dir-grid">
        {filtered.map((org, i) => (
          <Motion.article
            key={org.name}
            className="uvs-dir-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(0.02 * i, 0.3), duration: 0.28 }}
          >
            <h4 className="uvs-dir-card-name">{org.name}</h4>
            <p className="uvs-dir-card-count">
              {org.opps.length} opportunit{org.opps.length === 1 ? "y" : "ies"}
            </p>
            {org.causes.length > 0 && (
              <div className="uvs-dir-card-causes">
                {org.causes.slice(0, 4).map((cause) => (
                  <span key={cause} className="uvs-dir-cause">{cause.replace(/_/g, " ")}</span>
                ))}
                {org.causes.length > 4 && (
                  <span className="uvs-dir-cause">+{org.causes.length - 4}</span>
                )}
              </div>
            )}
            {org.url && (
              <a
                className="uvs-dir-card-link"
                href={org.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit website →
              </a>
            )}
          </Motion.article>
        ))}
      </div>
    </>
  )
}

export default function MainDashboard({ onBrowseOpportunities }) {
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

  const { groups, remoteCount, unplacedCount } = useMemo(() => {
    const byPlace = new Map()
    let remote = 0
    let unplaced = 0
    for (const opp of opportunities) {
      const hit = locateOpportunity(opp)
      if (!hit) { unplaced++; continue }
      if (hit.remote) { remote++; continue }
      if (!byPlace.has(hit.key)) byPlace.set(hit.key, { label: hit.label, coords: hit.coords, opps: [] })
      byPlace.get(hit.key).opps.push(opp)
    }
    return { groups: [...byPlace.values()], remoteCount: remote, unplacedCount: unplaced }
  }, [opportunities])

  if (loading) {
    return (
      <div className="uvs-opp-loading" role="status" aria-label="Loading dashboard">
        <span className="uvs-opp-loading-stripe" aria-hidden="true" />
        <span className="uvs-opp-loading-stripe" aria-hidden="true" />
        <span className="uvs-opp-loading-stripe" aria-hidden="true" />
        <span className="uvs-opp-loading-stripe" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="uvs-dashgrid">
      {error && <p className="uvs-lb-error uvs-dashgrid-error">{error}</p>}

      <section className="uvs-dash-panel uvs-dash-panel--map">
        <p className="uvs-committee-section-label">Map</p>
        <OpportunityMap
          groups={groups}
          remoteCount={remoteCount}
          unplacedCount={unplacedCount}
        />
      </section>

      <section className="uvs-dash-panel uvs-dash-panel--upcoming">
        <p className="uvs-committee-section-label">Upcoming</p>
        <UpcomingPanel opportunities={opportunities} onBrowse={onBrowseOpportunities} />
      </section>

      <section className="uvs-dash-panel uvs-dash-panel--directory">
        <p className="uvs-committee-section-label">Directory</p>
        <DirectoryPanel opportunities={opportunities} />
      </section>
    </div>
  )
}
