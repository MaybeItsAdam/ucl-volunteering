import React, { useMemo, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import VolSocHand from "./VolSocHand"
import "./volunteeringWebsite.css"

const TYPES = [
  { id: "all", label: "All" },
  { id: "slp", label: "Student led", short: "SLP" },
  { id: "glp", label: "Group led", short: "GLP" },
  { id: "elp", label: "External led", short: "ELP" },
  { id: "social", label: "Social", short: "SOC" }
]

const CADENCES = [
  { id: "all", label: "Any time" },
  { id: "weekly", label: "Weekly" },
  { id: "oneoff", label: "One-off" },
  { id: "open", label: "Open all the time" }
]

const TYPE_LABEL = { slp: "SLP", glp: "GLP", elp: "ELP", social: "SOCIAL" }
const CADENCE_LABEL = { weekly: "Weekly", oneoff: "One-off", open: "Open all the time" }

const TONE_VAR = {
  slp: "var(--lavender-purple)",
  glp: "var(--golden-pollen)",
  elp: "var(--brick-red)",
  social: "var(--baby-pink)"
}

const TAG_INK = {
  slp: "var(--prussian-blue)",
  glp: "var(--prussian-blue)",
  elp: "var(--linen)",
  social: "var(--prussian-blue)"
}

function toneFor(types) {
  if (types.length === 1) return TONE_VAR[types[0]]
  const stripe = 14
  const stops = types
    .map((t, i) => `${TONE_VAR[t]} ${i * stripe}px ${(i + 1) * stripe}px`)
    .join(", ")
  return `repeating-linear-gradient(45deg, ${stops})`
}

const OPPORTUNITIES = [
  {
    id: "bloomsbury-reads",
    title: "Bloomsbury Reads",
    types: ["slp", "social"],
    blurb: "Weekly reading sessions with primary school pupils in Camden.",
    cadence: "weekly",
    location: "Camden"
  },
  {
    id: "climate-kitchen",
    title: "UCL Climate Kitchen",
    types: ["slp"],
    blurb: "Cook and share surplus-food meals across UCL halls.",
    cadence: "weekly",
    location: "Bloomsbury"
  },
  {
    id: "camden-cycles",
    title: "Camden Cycles",
    types: ["slp"],
    blurb: "Refurbish donated bikes and give them to refugee families.",
    cadence: "oneoff",
    location: "Kentish Town"
  },
  {
    id: "ewb-outreach",
    title: "Engineers Without Borders",
    types: ["glp"],
    blurb: "Run engineering workshops with the Engineering Society.",
    cadence: "oneoff",
    location: "UCL East"
  },
  {
    id: "stepup-mentoring",
    title: "StepUp Mentoring",
    types: ["glp", "social"],
    blurb: "Mentor sixth-formers through the access-to-UCL programme.",
    cadence: "weekly",
    location: "Online"
  },
  {
    id: "music-outreach",
    title: "UCL Music Outreach",
    types: ["glp"],
    blurb: "Bring instruments and lessons to state schools in Islington.",
    cadence: "weekly",
    location: "Islington"
  },
  {
    id: "crisis-shifts",
    title: "Crisis at Christmas",
    types: ["elp"],
    blurb: "Volunteer shifts at Crisis UK's London winter centres.",
    cadence: "oneoff",
    location: "Across London"
  },
  {
    id: "age-uk-camden",
    title: "Age UK Camden Befriending",
    types: ["elp", "social"],
    blurb: "Visit older neighbours for a weekly cup of tea and chat.",
    cadence: "weekly",
    location: "Camden"
  },
  {
    id: "southwark-food-bank",
    title: "Southwark Food Bank",
    types: ["elp"],
    blurb: "Drop-in support sorting donations at a local food bank.",
    cadence: "open",
    location: "Southwark"
  },
  {
    id: "welfare-walks",
    title: "Welfare Walks",
    types: ["social"],
    blurb: "Informal walks and check-ins for UCL students who want company.",
    cadence: "weekly",
    location: "Regent's Park"
  },
  {
    id: "volsoc-socials",
    title: "VolSoc Socials",
    types: ["social"],
    blurb: "Pub nights and meetups for volunteers across projects.",
    cadence: "weekly",
    location: "Bloomsbury"
  }
]

export default function Dashboard() {
  const [typeFilter, setTypeFilter] = useState("all")
  const [cadenceFilter, setCadenceFilter] = useState("all")
  const [query, setQuery] = useState("")

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase()
    return OPPORTUNITIES.filter((opp) => {
      if (typeFilter !== "all" && !opp.types.includes(typeFilter)) return false
      if (cadenceFilter !== "all" && opp.cadence !== cadenceFilter) return false
      if (q) {
        const hay = `${opp.title} ${opp.blurb} ${opp.location}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [typeFilter, cadenceFilter, query])

  return (
    <div className="uvs">
      <header className="uvs-topbar">
        <a className="uvs-mark" href="#/">
          <VolSocHand className="uvs-mark-logo" />
          <span>UCL Volunteering Society</span>
        </a>
        <nav className="uvs-nav" aria-label="Primary">
          <a href="#/">Home</a>
          <a href="#/dashboard" aria-current="page">Opportunities</a>
          <a href="#/#connect">Connect</a>
        </nav>
      </header>

      <section className="uvs-section">
        <div className="uvs-section-head">
          <p className="uvs-eyebrow">Opportunities</p>
          <h2>Find something that fits</h2>
          <p className="uvs-section-lede">
            Filter by type or cadence, or search by name, theme, or neighbourhood.
          </p>
        </div>

        <div className="uvs-controls">
          <label className="uvs-search">
            <span className="uvs-sr">Search opportunities</span>
            <input
              type="search"
              placeholder="Search opportunities…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <div className="uvs-filter-group" role="tablist" aria-label="Filter by type">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={typeFilter === t.id}
                className={`uvs-filter uvs-filter-${t.id}${typeFilter === t.id ? " is-active" : ""}`}
                onClick={() => setTypeFilter(t.id)}
              >
                {t.label}
                {t.short && <span className="uvs-filter-short">{t.short}</span>}
              </button>
            ))}
          </div>

          <div className="uvs-filter-group" role="tablist" aria-label="Filter by cadence">
            {CADENCES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={cadenceFilter === c.id}
                className={`uvs-filter uvs-filter-cadence${cadenceFilter === c.id ? " is-active" : ""}`}
                onClick={() => setCadenceFilter(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <motion.div layout className="uvs-cards">
          <AnimatePresence mode="popLayout" initial={false}>
            {matched.map((opp) => (
              <motion.article
                key={opp.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
                transition={{ duration: 0.26, ease: [0.22, 0.9, 0.32, 1] }}
                className="uvs-card"
                style={{ "--tone": toneFor(opp.types) }}
              >
                <div className="uvs-card-tags">
                  {opp.types.map((t) => (
                    <span
                      key={t}
                      className="uvs-card-tag"
                      style={{ background: TONE_VAR[t], color: TAG_INK[t] }}
                    >
                      {TYPE_LABEL[t]}
                    </span>
                  ))}
                </div>
                <h3>{opp.title}</h3>
                <p className="uvs-card-blurb">{opp.blurb}</p>
                <dl className="uvs-card-meta">
                  <div>
                    <dt>When</dt>
                    <dd>{CADENCE_LABEL[opp.cadence]}</dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>{opp.location}</dd>
                  </div>
                </dl>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>

        {matched.length === 0 && (
          <p className="uvs-empty">Nothing matches yet — try clearing a filter.</p>
        )}
      </section>

      <footer className="uvs-footer">
        <div className="uvs-footer-brand">
          <VolSocHand className="uvs-footer-logo" />
          <span>UCL Volunteering Society</span>
        </div>
      </footer>
    </div>
  )
}
