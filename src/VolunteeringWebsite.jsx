import { useMemo, useState } from "react"
import UclFlag from "./UclFlag"
import VolSocHand from "./VolSocHand"
import "./volunteeringWebsite.css"

const OPPORTUNITY_TYPES = {
  svs: "Social Volunteering Sessions",
  slp: "Student Led Projects",
  glp: "Group Led Projects",
  elp: "External Volunteering Opportunities"
}

const OPPORTUNITY_TYPE_META = {
  svs: { tone: "pink" },
  slp: { tone: "lavender" },
  glp: { tone: "gold" },
  elp: { tone: "brick" }
}

const DEFAULT_OPPORTUNITY_TYPE_LABEL = "Other opportunity"

const SUBTYPE_META = {
  social: { label: "Social", tone: "lavender" },
  education: { label: "Education", tone: "gold" },
  environment: { label: "Environment", tone: "green" },
  external: { label: "External", tone: "tomato" }
}

const DEFAULT_SUBTYPE_META = { label: "Other", tone: "lavender" }

const PROJECT_TEMPLATES = {
  social: {
    fields: [
      { key: "location", label: "Location" },
      { key: "time", label: "Time" }
    ]
  },
  education: {
    fields: [
      { key: "location", label: "Location" },
      { key: "audience", label: "Audience" }
    ]
  },
  environment: {
    fields: [
      { key: "location", label: "Location" },
      { key: "schedule", label: "Schedule" }
    ]
  },
  external: {
    fields: [
      { key: "partnerDescription", label: "Partner" },
      { key: "companyWebsite", label: "Website", kind: "link" }
    ]
  }
}

const PROJECTS = [
  {
    id: "pals-night",
    title: "Community Pals Night",
    subtype: "social",
    opportunityType: "svs",
    summary: "Friendly weekly socials with local youth clubs.",
    location: "Bloomsbury Community Hall",
    time: "Wednesdays, 18:00–20:00"
  },
  {
    id: "care-home-connect",
    title: "Care Home Connect",
    subtype: "social",
    opportunityType: "svs",
    summary: "Conversation and games sessions with care-home residents.",
    location: "Camden Wellbeing Centre",
    time: "Fridays, 16:00–17:30"
  },
  {
    id: "maths-mentors",
    title: "Maths Mentors",
    subtype: "education",
    opportunityType: "slp",
    summary: "Support GCSE pupils with confidence and study habits.",
    location: "UCL South Wing",
    audience: "Years 10–11"
  },
  {
    id: "reading-buddies",
    title: "Reading Buddies",
    subtype: "education",
    opportunityType: "glp",
    summary: "One-to-one reading sessions for primary school pupils.",
    location: "King's Cross Primary School",
    audience: "Years 4–6"
  },
  {
    id: "canal-cleanup",
    title: "Regent's Canal Cleanup",
    subtype: "environment",
    opportunityType: "glp",
    summary: "Monthly litter-picks and biodiversity reporting walks.",
    location: "Camden Lock",
    schedule: "First Saturday each month"
  },
  {
    id: "charity-comms",
    title: "Charity Digital Comms",
    subtype: "external",
    opportunityType: "elp",
    summary: "Create campaign assets with an established charity partner.",
    partnerDescription: "Support outreach campaigns for FoodCycle London.",
    companyWebsite: "https://www.foodcycle.org.uk/"
  }
]

const SUBTYPE_KEYS = Object.keys(SUBTYPE_META)

const getSearchText = (project) => {
  const subtypeMeta = SUBTYPE_META[project.subtype] ?? DEFAULT_SUBTYPE_META
  const template = PROJECT_TEMPLATES[project.subtype] ?? { fields: [] }
  const opportunityTypeLabel =
    OPPORTUNITY_TYPES[project.opportunityType] ?? DEFAULT_OPPORTUNITY_TYPE_LABEL
  const templateValues = template.fields
    .map((field) => project[field.key])
    .filter((value) => value !== undefined && value !== null)
    .join(" ")

  return [
    project.title,
    project.summary,
    subtypeMeta.label,
    opportunityTypeLabel,
    templateValues
  ]
    .join(" ")
    .toLowerCase()
}

export default function VolunteeringWebsite({ activeView = "home", onNavigate }) {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()

  const handleNavigate = (view) => {
    if (onNavigate) {
      onNavigate(view)
    }
  }

  const filteredProjects = useMemo(() => {
    if (!normalizedQuery) return PROJECTS
    return PROJECTS.filter((project) => getSearchText(project).includes(normalizedQuery))
  }, [normalizedQuery])

  const filteredProjectsBySubtype = useMemo(
    () =>
      SUBTYPE_KEYS.reduce((accumulator, subtype) => {
        accumulator[subtype] = filteredProjects.filter((project) => project.subtype === subtype)
        return accumulator
      }, {}),
    [filteredProjects]
  )

  return (
    <div className="uvs">
      <header className="uvs-topbar">
        <a
          className="uvs-mark"
          href="/"
          onClick={(event) => {
            event.preventDefault()
            handleNavigate("home")
          }}
        >
          <VolSocHand className="uvs-mark-logo" />
          <span>UCL Volunteering Society</span>
        </a>
        <nav className="uvs-nav" aria-label="Primary">
          <a
            href="/"
            className={activeView === "home" ? "is-active" : undefined}
            onClick={(event) => {
              event.preventDefault()
              handleNavigate("home")
            }}
          >
            Home
          </a>
          <a
            href="/dashboard"
            className={activeView === "dashboard" ? "is-active" : undefined}
            onClick={(event) => {
              event.preventDefault()
              handleNavigate("dashboard")
            }}
          >
            Dashboard
          </a>
          {activeView === "dashboard" ? (
            <>
              <a href="#social">Social</a>
              <a href="#external">External</a>
            </>
          ) : null}
        </nav>
      </header>

      {activeView === "home" ? (
        <main className="uvs-home" id="top">
          <section className="uvs-home-hero">
            <div className="uvs-home-flag-wrap" aria-hidden="true">
              <UclFlag className="uvs-home-flag" />
            </div>
            <div className="uvs-home-copy">
              <p className="uvs-eyebrow">Welcome</p>
              <VolSocHand className="uvs-home-logo" />
              <h1>UCL Volunteering Society</h1>
              <p className="uvs-lede">
                Join student-led volunteering that makes a local impact. Browse our current
                projects or jump into the dashboard to find the right opportunity.
              </p>
              <button type="button" className="uvs-cta" onClick={() => handleNavigate("dashboard")}>
                Open Dashboard
              </button>
            </div>
          </section>

          <section className="uvs-section">
            <div className="uvs-section-head">
              <p className="uvs-eyebrow">At a glance</p>
              <h2>How you can get involved</h2>
              <p className="uvs-section-lede">
                Social sessions, education mentoring, environmental action, and external charity
                partnerships all run throughout term.
              </p>
            </div>
            <ProjectGrid projects={PROJECTS.slice(0, 3)} />
          </section>
        </main>
      ) : (
        <main id="dashboard" className="uvs-dashboard">
          <section className="uvs-hero" id="top">
            <div className="uvs-hero-copy">
              <p className="uvs-eyebrow">Volunteering Dashboard</p>
              <h1>Find your next opportunity</h1>
              <p className="uvs-lede">
                Search across all projects, or browse each subtype below.
              </p>
            </div>
            <label className="uvs-search" htmlFor="opportunity-search">
              <span>Search opportunities</span>
              <input
                id="opportunity-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try location, audience, partner, time..."
              />
            </label>
          </section>

          <section className="uvs-section" id="all-opportunities">
            <div className="uvs-section-head">
              <p className="uvs-eyebrow">All opportunities</p>
              <h2>Everything currently available</h2>
            </div>
            <ProjectGrid projects={filteredProjects} />
          </section>

          {SUBTYPE_KEYS.map((subtype) => {
            const projectsForSubtype = filteredProjectsBySubtype[subtype] ?? []
            return (
              <section className="uvs-section" id={subtype} key={subtype}>
                <div className="uvs-section-head">
                  <p className="uvs-eyebrow">{SUBTYPE_META[subtype].label}</p>
                  <h2>{SUBTYPE_META[subtype].label} opportunities</h2>
                </div>
                <ProjectGrid projects={projectsForSubtype} />
              </section>
            )
          })}
        </main>
      )}

      <footer className="uvs-footer">
        <div className="uvs-footer-brand">
          <VolSocHand className="uvs-footer-logo" />
          <span>UCL Volunteering Society</span>
        </div>
        <ul className="uvs-palette" aria-label="Brand palette">
          <li style={{ "--sw": "#10C4C0" }} title="Strong Cyan" />
          <li style={{ "--sw": "#061C33" }} title="Prussian Blue" />
          <li style={{ "--sw": "#FEEFE5" }} title="Linen" />
          <li style={{ "--sw": "#F26640" }} title="Tomato" />
          <li style={{ "--sw": "#8FB339" }} title="Lime Moss" />
          <li style={{ "--sw": "#FF99C8" }} title="Baby Pink" />
          <li style={{ "--sw": "#9B5DE5" }} title="Lavender Purple" />
          <li style={{ "--sw": "#FFD23F" }} title="Golden Pollen" />
          <li style={{ "--sw": "#AD2E24" }} title="Brick Red" />
        </ul>
      </footer>
    </div>
  )
}

function ProjectGrid({ projects }) {
  if (projects.length === 0) {
    return <p className="uvs-empty">No opportunities match your current search.</p>
  }

  return (
    <div className="uvs-cards">
      {projects.map((project) => {
        const subtypeMeta = SUBTYPE_META[project.subtype] ?? DEFAULT_SUBTYPE_META
        const template = PROJECT_TEMPLATES[project.subtype] ?? { fields: [] }
        const opportunityType =
          OPPORTUNITY_TYPES[project.opportunityType] ?? DEFAULT_OPPORTUNITY_TYPE_LABEL
        const opportunityTypeMeta = OPPORTUNITY_TYPE_META[project.opportunityType] ?? {
          tone: "lavender"
        }
        const populatedFields = template.fields.filter((field) => {
          const value = project[field.key]
          return value !== undefined && value !== null
        })
        return (
          <article key={project.id} className={`uvs-card uvs-card-${opportunityTypeMeta.tone}`}>
            <div className="uvs-card-top">
              <span className="uvs-card-tag">{subtypeMeta.label}</span>
              <span className="uvs-card-type">{opportunityType}</span>
            </div>
            <h3>{project.title}</h3>
            <p className="uvs-card-blurb">{project.summary}</p>
            <dl className="uvs-card-meta">
              {populatedFields.map((field) => {
                const value = project[field.key]
                return (
                  <div key={field.key}>
                    <dt>{field.label}</dt>
                    <dd>
                      {field.kind === "link" ? (
                        <a href={value} target="_blank" rel="noreferrer">
                          {value}
                        </a>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </article>
        )
      })}
    </div>
  )
}
