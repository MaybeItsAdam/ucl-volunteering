import React from "react"
import VolSocHand from "./VolSocHand"
import UclFlag, { useSunState, skyColors } from "./UclFlag"
import "./volunteeringWebsite.css"

export default function VolunteeringWebsite() {
  const sun = useSunState()
  const { top, bot } = skyColors(sun.elevation)

  return (
    <div className="uvs">
      <section
        className="uvs-hero"
        id="top"
        style={{ "--sky-top": top, "--sky-bot": bot }}
      >
        <div className="uvs-flag-sky" aria-hidden="true" />
        <div className="uvs-hero-flag" aria-hidden="true">
          <UclFlag />
        </div>
        <div className="uvs-hero-copy">
          <VolSocHand className="uvs-hero-logo" />
          <h1>UCL Volunteering Society</h1>
          <p className="uvs-lede">
            We connect UCL students with volunteering opportunities across London —
            student-led, group-led, and external. Weekly, one-off, or whenever you can.
          </p>
          <div className="uvs-cta-row">
            <a className="uvs-cta uvs-cta-primary" href="#/dashboard">
              Browse opportunities →
            </a>
            <a className="uvs-cta uvs-cta-ghost" href="#connect">
              Say hello
            </a>
          </div>
        </div>
      </section>

      <section className="uvs-section uvs-section-pink" id="connect">
        <div className="uvs-section-head">
          <p className="uvs-eyebrow">Come say hi</p>
          <h2>Socials are how we meet you first</h2>
          <p className="uvs-section-lede">
            No experience required. Our socials are a soft landing — turn up, find your
            people, and get pointed towards the projects that'll suit you.
          </p>
          <div className="uvs-cta-row">
            <a className="uvs-cta uvs-cta-primary" href="#/dashboard">
              Browse opportunities →
            </a>
          </div>
        </div>
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
