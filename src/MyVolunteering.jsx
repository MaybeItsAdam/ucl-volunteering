import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'motion/react'
import { api } from './api'
import { RIBBON_HEX } from './CommitteeDashboard'

const COLOUR_ORDER = [
  'red', 'orange', 'gold', 'green', 'blue', 'purple',
  'pink', 'rainbow', 'silver', 'white',
]

function getPrimaryCategory(opp) {
  if (Array.isArray(opp.categories) && opp.categories.length > 0) return opp.categories[0]
  if (opp.category) return opp.category
  return 'external'
}

function Ribbon({ colour, size = 18, idx = 0, variant = 'dot' }) {
  const bg = RIBBON_HEX[colour] || '#ccc'
  const isStripe = variant === 'stripe'
  return (
    <Motion.span
      title={colour}
      initial={{ opacity: 0, y: isStripe ? 6 : -16, rotate: isStripe ? 0 : -25, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{
        delay: 0.04 * idx,
        type: 'spring',
        stiffness: 220,
        damping: 14,
      }}
      whileHover={isStripe ? { scale: 1.06 } : { scale: 1.18, rotate: 8 }}
      style={{
        display: 'inline-block',
        width: isStripe ? Math.round(size * 2.25) : size,
        height: isStripe ? Math.max(6, Math.round(size * 0.55)) : size,
        borderRadius: isStripe ? 999 : '50%',
        background: bg,
        border: '1px solid rgba(0,0,0,0.12)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        flexShrink: 0,
      }}
    />
  )
}

function ColourTotalsBar({ totals }) {
  const entries = useMemo(() => {
    const order = new Map(COLOUR_ORDER.map((c, i) => [c, i]))
    return Object.entries(totals)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
  }, [totals])

  if (entries.length === 0) return null

  return (
    <div className="uvs-colour-totals">
      {entries.map(([colour, count], i) => (
        <Motion.div
          key={colour}
          className="uvs-colour-total"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.32 }}
        >
          <span
            className="uvs-colour-total-dot"
            style={{ background: RIBBON_HEX[colour] || '#ccc' }}
          />
          <span className="uvs-colour-total-count">×{count}</span>
        </Motion.div>
      ))}
    </div>
  )
}

export default function MyVolunteering({ user }) {
  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)
  const [savedOpportunities, setSavedOpportunities] = useState([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [savedError, setSavedError] = useState(null)

  const loadMe = useCallback(() => {
    if (!user) {
      setMe(null)
      setError(null)
      return
    }
    api.getMe()
      .then(setMe)
      .catch((e) => setError(e.message))
  }, [user])

  const loadSaved = useCallback(() => {
    if (!user) {
      setSavedOpportunities([])
      setSavedError(null)
      setSavedLoading(false)
      return
    }
    setSavedLoading(true)
    api.getOpportunities()
      .then((d) => {
        setSavedOpportunities((d.opportunities || []).filter((opp) => opp.starred))
        setSavedError(null)
      })
      .catch((e) => setSavedError(e.message))
      .finally(() => setSavedLoading(false))
  }, [user])

  useEffect(() => { loadMe() }, [loadMe])
  useEffect(() => { loadSaved() }, [loadSaved])

  const sessions = useMemo(() => me?.sessions ?? [], [me])
  const allColours = useMemo(
    () => sessions.flatMap((s) => s.colours || []),
    [sessions],
  )

  const colourTotals = useMemo(() => {
    const out = {}
    for (const c of allColours) out[c] = (out[c] || 0) + 1
    return out
  }, [allColours])

  return (
    <div className="uvs-my-vol">
      <section className="uvs-my-vol-section">
        <p className="uvs-committee-section-label">Ribbons</p>

        {!user && (
          <p className="uvs-empty uvs-empty--compact">Sign in to see your ribbons.</p>
        )}

        {user && (
          <>
            {error && <p className="uvs-lb-error">{error}</p>}
            {!me && !error && <p className="uvs-lb-loading">Loading…</p>}

            {me && (
              <div className="uvs-my-vol-header">
                <div className="uvs-my-vol-stats">
                  <span className="uvs-my-vol-stat">
                    <strong>{sessions.length}</strong> session{sessions.length !== 1 ? 's' : ''}
                  </span>
                  <span className="uvs-my-vol-stat">
                    <strong>{allColours.length}</strong> ribbon{allColours.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {allColours.length > 0 && (
                  <div className="uvs-my-vol-collection">
                    <AnimatePresence initial>
                      {allColours.map((c, i) => (
                        <Ribbon key={`${c}-${i}`} colour={c} idx={i} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                <ColourTotalsBar totals={colourTotals} />
              </div>
            )}

            {me && sessions.length === 0 && (
              <p className="uvs-empty uvs-empty--compact">No sessions recorded yet — get volunteering!</p>
            )}

            {sessions.length > 0 && (
              <div className="uvs-my-vol-list">
                {sessions.map((s, i) => (
                  <Motion.div
                    key={s.id}
                    className="uvs-my-vol-row"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.02 * i, duration: 0.28 }}
                  >
                    <div className="uvs-my-vol-row-info">
                      <span className="uvs-my-vol-row-name">{s.sessionName}</span>
                      {s.notes && <span className="uvs-my-vol-row-notes">{s.notes}</span>}
                    </div>
                    <div className="uvs-my-vol-row-right">
                      <div className="uvs-my-vol-row-ribbons">
                        {(s.colours || []).map((c, ci) => (
                          <Ribbon key={ci} colour={c} idx={ci} size={14} variant="stripe" />
                        ))}
                        {(!s.colours || s.colours.length === 0) && (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>uncoloured</span>
                        )}
                      </div>
                      <span className="uvs-my-vol-row-date">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="uvs-my-vol-section">
        <p className="uvs-committee-section-label">Saved opportunities</p>

        {!user && (
          <p className="uvs-empty uvs-empty--compact">Sign in to save opportunities.</p>
        )}

        {user && savedError && <p className="uvs-lb-error">{savedError}</p>}
        {user && savedLoading && <p className="uvs-lb-loading">Loading…</p>}

        {user && !savedLoading && savedOpportunities.length === 0 && !savedError && (
          <p className="uvs-empty uvs-empty--compact">No saved opportunities yet.</p>
        )}

        {user && savedOpportunities.length > 0 && (
          <div className="uvs-my-vol-list">
            {savedOpportunities.map((opp, i) => (
              <Motion.div
                key={opp.id}
                className={`uvs-my-vol-row uvs-card--${getPrimaryCategory(opp)}`}
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
              </Motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
