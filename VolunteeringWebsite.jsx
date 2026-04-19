import React from "react"
import UclFlag from "./UclFlag"
import "./volunteeringWebsite.css"

const PROJECT_TYPES = [
  {
    title: "Student Led Projects",
    short: "SLP",
    className: "slp",
    description: "The heart of UCL Volunteering led by students for local impact"
  },
  {
    title: "Group Led Projects",
    short: "GLP",
    className: "glp",
    description: "Clubs, societies, networks, and the Union helping missions spread far"
  },
  {
    title: "External Led Projects",
    short: "ELP",
    className: "elp",
    description: "Partnerships with organisations across London and beyond"
  }
]

const PROJECT_CADENCE = ["Weekly recurring", "One off events and trips", "Open all the time"]

const OPERATION_MODES = [
  {
    label: "Socials",
    className: "socials",
    note: "Approachable and welcoming to all experience levels"
  },
  {
    label: "Student Led Projects",
    className: "slp",
    note: "Lavender purple for the student voice"
  },
  {
    label: "Group Led Projects",
    className: "glp",
    note: "Golden pollen for missions that spread far"
  },
  {
    label: "External Led Projects",
    className: "elp",
    note: "Brick red for city establishments and partners"
  }
]

export default function VolunteeringWebsite({ logoTextureUrl }) {
  return (
    <div className="uvs-site">
      <aside className="uvs-flag-column" aria-label="UCL Volunteering flag">
        <UclFlag logoTextureUrl={logoTextureUrl} interactive={false} />
      </aside>

      <main className="uvs-content">
        <header className="uvs-header">
          <p className="uvs-kicker">UCL Volunteering Society</p>
          <h1>Operational guidelines and structure</h1>
          <p>Clear, direct, kind instructions</p>
        </header>

        <section className="uvs-section">
          <h2>Volunteering opportunities</h2>
          <div className="uvs-card-grid">
            {PROJECT_TYPES.map((project) => (
              <article key={project.short} className={`uvs-card ${project.className}`}>
                <h3>
                  {project.title} <span>{project.short}</span>
                </h3>
                <p>{project.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="uvs-section">
          <h2>Project cadence</h2>
          <ul className="uvs-list">
            {PROJECT_CADENCE.map((cadence) => (
              <li key={cadence}>{cadence}</li>
            ))}
          </ul>
        </section>

        <section className="uvs-section">
          <h2>Brand palette guidance</h2>
          <div className="uvs-swatch-grid">
            <div className="uvs-swatch strong-cyan">Strong cyan signature colour</div>
            <div className="uvs-swatch prussian-blue">Prussian Blue in place of black</div>
            <div className="uvs-swatch linen">Linen in place of white</div>
            <div className="uvs-swatch tomato">Tomato for guidance accents</div>
            <div className="uvs-swatch lime-moss">Lime Moss for guidance accents</div>
          </div>
        </section>

        <section className="uvs-section">
          <h2>How we operate</h2>
          <div className="uvs-mode-grid">
            {OPERATION_MODES.map((mode) => (
              <article key={mode.label} className={`uvs-mode ${mode.className}`}>
                <h3>{mode.label}</h3>
                <p>{mode.note}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
