import React from "react"
import VolSocHand from "./VolSocHand"
import UclFlag from "./UclFlag"
import "./volunteeringWebsite.css"

const PROJECT_TYPES = [
  {
    short: "SLP",
    title: "Student Led Projects",
    tone: "slp",
    blurb:
      "The heart of UCL. Projects dreamt up and run by students, for real impact in the communities around us.",
    detail: "Pitch an idea, shape a team, own the outcome."
  },
  {
    short: "GLP",
    title: "Group Led Projects",
    tone: "glp",
    blurb:
      "Clubs, societies, networks and the Union itself — their missions carried further through volunteering.",
    detail: "Bring your group's cause to a wider audience."
  },
  {
    short: "ELP",
    title: "External Led Projects",
    tone: "elp",
    blurb:
      "Partnerships with charities, schools and institutions across London and beyond.",
    detail: "Plug into established organisations and learn on the ground."
  }
]

const CADENCES = [
  { label: "Weekly recurring", hint: "A steady rhythm across the term" },
  { label: "One-off events & trips", hint: "Show up once, make it count" },
  { label: "Open all the time", hint: "Drop in whenever it suits you" }
]

export default function VolunteeringWebsite() {
  return (
    <div className="uvs">
      <header className="uvs-topbar">
        <a className="uvs-mark" href="#top">
          <VolSocHand className="uvs-mark-logo" />
          <span>UCL Volunteering Society</span>
        </a>
        <nav className="uvs-nav" aria-label="Primary">
          <a href="#opportunities">Opportunities</a>
          <a href="#cadence">Get involved</a>
          <a href="#connect">Connect</a>
        </nav>
      </header>

      <section className="uvs-hero" id="top">
        <div className="uvs-hero-copy">
          <p className="uvs-eyebrow">Volunteer with UCL</p>
          <h1>
            Give your time.
            <br />
            Grow a community.
          </h1>
          <p className="uvs-lede">
            We connect UCL students with volunteering opportunities across London —
            student-led, group-led, and external. Weekly, one-off, or whenever you can.
          </p>
          <div className="uvs-cta-row">
            <a className="uvs-cta uvs-cta-primary" href="#opportunities">
              See opportunities
            </a>
            <a className="uvs-cta uvs-cta-ghost" href="#connect">
              Say hello
            </a>
          </div>
        </div>
        <div className="uvs-hero-flag" aria-hidden="true">
          <UclFlag />
        </div>
      </section>

      <section className="uvs-section" id="opportunities">
        <div className="uvs-section-head">
          <p className="uvs-eyebrow">Three ways to volunteer</p>
          <h2>Pick the shape that fits you</h2>
        </div>
        <div className="uvs-cards">
          {PROJECT_TYPES.map((project) => (
            <article key={project.short} className={`uvs-card uvs-card-${project.tone}`}>
              <span className="uvs-card-tag">{project.short}</span>
              <h3>{project.title}</h3>
              <p className="uvs-card-blurb">{project.blurb}</p>
              <p className="uvs-card-detail">{project.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="uvs-section uvs-section-invert" id="cadence">
        <div className="uvs-section-head">
          <p className="uvs-eyebrow uvs-eyebrow-light">How often</p>
          <h2>A cadence for every calendar</h2>
        </div>
        <ul className="uvs-cadence">
          {CADENCES.map((item) => (
            <li key={item.label}>
              <span className="uvs-cadence-label">{item.label}</span>
              <span className="uvs-cadence-hint">{item.hint}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="uvs-section uvs-section-pink" id="connect">
        <div className="uvs-section-head">
          <p className="uvs-eyebrow">Come say hi</p>
          <h2>Socials are how we meet you first</h2>
          <p className="uvs-section-lede">
            No experience required. Our socials are a soft landing — turn up, find your
            people, and get pointed towards the projects that'll suit you.
          </p>
        </div>
      </section>

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
