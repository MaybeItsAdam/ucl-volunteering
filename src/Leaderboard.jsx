import React, { useEffect, useState } from 'react'
import { api } from './api'
import { useAuth, signIn } from './auth'

const RIBBON_COLOURS = {
  red: '#ef4444',
  blue: '#3b82f6',
  gold: '#f59e0b',
  green: '#22c55e',
  purple: '#a855f7',
  orange: '#f97316',
  rainbow: 'linear-gradient(90deg,#ef4444,#f97316,#f59e0b,#22c55e,#3b82f6,#a855f7)',
  silver: '#94a3b8',
  pink: '#ec4899',
  white: '#e2e8f0',
}

const COLOUR_BADGES = {
  'Commendation': { bg: '#dbeafe', color: '#1e40af' },
  'Half Colour': { bg: '#fef3c7', color: '#92400e' },
  'Full Colour': { bg: '#dcfce7', color: '#166534' },
  'Distinction': { bg: '#f3e8ff', color: '#6b21a8' },
}

const MEDALS = ['🥇', '🥈', '🥉']

function RibbonDot({ colour }) {
  const bg = RIBBON_COLOURS[colour] || '#ccc'
  return (
    <span
      title={colour}
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: bg,
        border: '1px solid rgba(0,0,0,0.1)',
        flexShrink: 0,
      }}
    />
  )
}

function ColourBadge({ name }) {
  const style = COLOUR_BADGES[name] || { bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{
      background: style.bg,
      color: style.color,
      padding: '1px 8px',
      borderRadius: 999,
      fontSize: '0.75rem',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {name}
    </span>
  )
}

export default function Leaderboard() {
  const { user, loading: authLoading } = useAuth()
  const [board, setBoard] = useState(null)
  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.getLeaderboard()
      .then((d) => setBoard(d.leaderboard))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (user) {
      api.getMe()
        .then(setMe)
        .catch(() => {})
    }
  }, [user])

  return (
    <>
      {!authLoading && !user && (
        <div className="uvs-signin-banner">
          <p>Sign in to see your own ribbons and colours</p>
          <button className="uvs-cta uvs-cta-primary" onClick={signIn}>Sign in with UCL</button>
        </div>
      )}

      {user && me && (
        <div className="uvs-me-card">
          <div className="uvs-me-stat">
            <span className="uvs-me-stat-label">My sessions</span>
            <span className="uvs-me-stat-value">{(me.sessions?.length ?? 0) + me.ribbons.length}</span>
          </div>
          <div className="uvs-me-ribbons">
            {(me.sessions ?? []).flatMap((s, si) => (s.colours || []).map((c, ci) => <RibbonDot key={`s${si}-${ci}`} colour={c} />))}
            {me.ribbons.flatMap((r) => (r.colours || []).map((c, i) => <RibbonDot key={`r${r.id}-${i}`} colour={c} />))}
          </div>
          {me.colours.length > 0 && (
            <div className="uvs-me-colours">
              {me.colours.map((c) => <ColourBadge key={c.id} name={c.colourName} />)}
            </div>
          )}
        </div>
      )}

      {error && <p className="uvs-lb-error">{error}</p>}
      {!board && !error && <p className="uvs-lb-loading">Loading…</p>}

      {board && (
        <div className="uvs-lb-list">
          {board.length === 0 && <p className="uvs-empty">No entries yet — start volunteering!</p>}
          {board.map((row) => (
            <div
              key={row.userId}
              className={`uvs-lb-row${user?.id === row.userId ? ' uvs-lb-row--me' : ''}`}
            >
              <span className="uvs-lb-rank">
                {row.rank <= 3 ? MEDALS[row.rank - 1] : `#${row.rank}`}
              </span>
              <div className="uvs-lb-info">
                <span className="uvs-lb-name">{row.name}</span>
                <div className="uvs-lb-ribbons">
                  {Object.entries(row.ribbonColours).map(([colour, count]) =>
                    Array.from({ length: count }, (_, i) => (
                      <RibbonDot key={`${colour}-${i}`} colour={colour} />
                    ))
                  )}
                </div>
              </div>
              <div className="uvs-lb-awards">
                <span className="uvs-lb-ribbon-count">{row.sessionCount ?? row.ribbonCount} session{(row.sessionCount ?? row.ribbonCount) !== 1 ? 's' : ''}</span>
                <div className="uvs-lb-colours">
                  {row.colours.map((c, i) => <ColourBadge key={i} name={c} />)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
