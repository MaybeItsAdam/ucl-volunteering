import React, { useEffect, useState, useCallback } from 'react'
import { api } from './api'

export const CAUSE_COLOUR_MAP = {
  education: 'blue', environment: 'green', health: 'red', community: 'orange',
  arts: 'purple', sport: 'gold', refugees: 'rainbow', elderly: 'silver',
  food: 'pink', housing: 'white', animals: 'green', disability: 'blue',
  mental_health: 'purple', poverty: 'orange', youth: 'gold',
}

export const RIBBON_HEX = {
  red: '#ef4444', blue: '#3b82f6', gold: '#f59e0b', green: '#22c55e',
  purple: '#a855f7', orange: '#f97316', rainbow: 'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7)',
  silver: '#94a3b8', pink: '#ec4899', white: '#cbd5e1',
}

const ALL_CAUSES = [
  'education', 'environment', 'health', 'community', 'arts', 'sport',
  'refugees', 'elderly', 'food', 'housing', 'animals', 'disability', 'mental_health', 'poverty', 'youth',
]

export function RibbonDot({ colour, size = 14 }) {
  const bg = RIBBON_HEX[colour] || '#ccc'
  return (
    <span title={colour} style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: bg, border: '1px solid rgba(0,0,0,0.12)', flexShrink: 0,
    }} />
  )
}

export function UserSearch({ value, onSelect }) {
  const [query, setQuery] = useState(value ? value.name : '')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (value) return
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      api.searchUsers(query).then((d) => setResults(d.users || [])).catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [query, value])

  return (
    <div className="uvs-field" style={{ position: 'relative' }}>
      <label className="uvs-label">Member</label>
      <input
        className="uvs-input"
        type="search"
        placeholder="Search by name or email…"
        value={value ? value.name : query}
        onChange={(e) => { setQuery(e.target.value); onSelect(null) }}
      />
      {results.length > 0 && !value && (
        <ul className="uvs-suggestions">
          {results.map((u) => (
            <li key={u.id}>
              <button type="button" className="uvs-suggestion-btn"
                onClick={() => { onSelect(u); setResults([]) }}>
                {u.name} <span className="uvs-suggestion-email">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function OpportunitySearch({ value, onSelect }) {
  const [query, setQuery] = useState(value ? value.title : '')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (value) return
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      api.getOpportunities({ search: query, limit: 8 })
        .then((d) => setResults(d.opportunities || []))
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [query, value])

  const previewColours = value
    ? [...new Set(value.causes.map(c => CAUSE_COLOUR_MAP[c]).filter(Boolean))]
    : []

  return (
    <div className="uvs-field" style={{ position: 'relative' }}>
      <label className="uvs-label">Opportunity</label>
      <input
        className="uvs-input"
        type="search"
        placeholder="Search opportunities…"
        value={value ? value.title : query}
        onChange={(e) => { setQuery(e.target.value); onSelect(null) }}
      />
      {results.length > 0 && !value && (
        <ul className="uvs-suggestions">
          {results.map((o) => {
            const colours = [...new Set(o.causes.map(c => CAUSE_COLOUR_MAP[c]).filter(Boolean))]
            return (
              <li key={o.id}>
                <button type="button" className="uvs-suggestion-btn"
                  onClick={() => { onSelect(o); setResults([]) }}>
                  <span style={{ flex: 1 }}>{o.title}</span>
                  <span style={{ display: 'flex', gap: 3 }}>
                    {colours.map(c => <RibbonDot key={c} colour={c} size={12} />)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {value && previewColours.length > 0 && (
        <div className="uvs-ribbon-preview">
          <span className="uvs-ribbon-preview-label">Will award:</span>
          {previewColours.map(c => (
            <span key={c} className="uvs-ribbon-chip">
              <RibbonDot colour={c} size={12} />
              {c}
            </span>
          ))}
          {previewColours.length === 0 && (
            <span className="uvs-ribbon-preview-none">No causes mapped — ribbon will be uncoloured</span>
          )}
        </div>
      )}
    </div>
  )
}

function SessionPanel({ onRefresh }) {
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedOpp, setSelectedOpp] = useState(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)
  const [sessions, setSessions] = useState(null)

  const load = useCallback(() => {
    api.getSessions().then((d) => setSessions(d.sessions)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedUser || !selectedOpp) return
    setSubmitting(true); setMsg(null)
    try {
      await api.recordSession(selectedUser.id, selectedOpp.id, notes)
      const colours = [...new Set(selectedOpp.causes.map(c => CAUSE_COLOUR_MAP[c]).filter(Boolean))]
      setMsg({ ok: true, text: `Recorded session for ${selectedUser.name}: "${selectedOpp.title}" — ${colours.join(', ') || 'uncoloured'} ribbon` })
      setSelectedUser(null); setSelectedOpp(null); setNotes('')
      load(); onRefresh()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this session?')) return
    await api.deleteSession(id).then(load).catch((e) => alert(e.message))
  }

  return (
    <>
      <div className="uvs-dash-card">
        <h3 className="uvs-dash-card-title">Record a Session</h3>
        <form className="uvs-dash-form" onSubmit={handleSubmit}>
          <UserSearch value={selectedUser} onSelect={setSelectedUser} />
          <OpportunitySearch value={selectedOpp} onSelect={setSelectedOpp} />
          <div className="uvs-field">
            <label className="uvs-label">Notes <span className="uvs-optional">(optional)</span></label>
            <input className="uvs-input" placeholder="Additional context…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {msg && <p className={msg.ok ? 'uvs-success' : 'uvs-error-msg'}>{msg.text}</p>}
          <button className="uvs-cta uvs-cta-primary" type="submit" disabled={submitting || !selectedUser || !selectedOpp}>
            {submitting ? 'Recording…' : 'Record Session'}
          </button>
        </form>
      </div>

      <div className="uvs-dash-card">
        <h3 className="uvs-dash-card-title">All Sessions</h3>
        {!sessions && <p className="uvs-lb-loading">Loading…</p>}
        {sessions?.length === 0 && <p className="uvs-empty">No sessions recorded yet.</p>}
        {sessions && sessions.length > 0 && (
          <div className="uvs-dash-table-wrap">
            <table className="uvs-dash-table">
              <thead><tr><th>Member</th><th>Session</th><th>Ribbon</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.user.name}</td>
                    <td>{s.sessionName}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {s.colours.map((c, i) => <RibbonDot key={i} colour={c} />)}
                        {s.colours.length === 0 && <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>none</span>}
                      </div>
                    </td>
                    <td className="uvs-td-date">{new Date(s.createdAt).toLocaleDateString()}</td>
                    <td><button className="uvs-dash-del" onClick={() => handleDelete(s.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

export default function CommitteeDashboard() {
  const [refreshKey, setRefreshKey] = useState(0)
  return <SessionPanel key={`s-${refreshKey}`} onRefresh={() => setRefreshKey(k => k + 1)} />
}
