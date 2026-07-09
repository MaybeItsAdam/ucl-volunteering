import { getToken } from './auth'
import { API_BASE } from './config'

function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Volunteering opportunities
  getOpportunities: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return apiFetch(`/api/volunteering${q ? '?' + q : ''}`)
  },
  starOpportunity: (id) =>
    apiFetch(`/api/volunteering/${id}/star`, { method: 'POST' }),
  unstarOpportunity: (id) =>
    apiFetch(`/api/volunteering/${id}/star`, { method: 'DELETE' }),

  // Leaderboard
  getLeaderboard: () => apiFetch('/api/volunteering-lb/leaderboard'),
  getMe: () => apiFetch('/api/volunteering-lb/me'),

  // Committee
  getRibbons: () => apiFetch('/api/volunteering-lb/ribbons'),
  awardRibbon: (userId, opportunityId, notes) =>
    apiFetch('/api/volunteering-lb/ribbons', {
      method: 'POST',
      body: JSON.stringify({ userId, opportunityId, notes }),
    }),
  deleteRibbon: (id) =>
    apiFetch(`/api/volunteering-lb/ribbons/${id}`, { method: 'DELETE' }),
  createOpportunity: (data) =>
    apiFetch('/api/volunteering', { method: 'POST', body: JSON.stringify(data) }),
  updateOpportunity: (id, data) =>
    apiFetch(`/api/volunteering/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getColours: () => apiFetch('/api/volunteering-lb/colours'),
  awardColour: (userId, colourName, notes) =>
    apiFetch('/api/volunteering-lb/colours', {
      method: 'POST',
      body: JSON.stringify({ userId, colourName, notes }),
    }),
  deleteColour: (id) =>
    apiFetch(`/api/volunteering-lb/colours/${id}`, { method: 'DELETE' }),

  searchUsers: (q) => apiFetch(`/api/users/search?q=${encodeURIComponent(q)}`),

  // Sessions
  getSessions: () => apiFetch('/api/volunteering-lb/sessions'),
  recordSession: (userId, opportunityId, notes) =>
    apiFetch('/api/volunteering-lb/sessions', {
      method: 'POST',
      body: JSON.stringify({ userId, opportunityId, notes }),
    }),
  deleteSession: (id) =>
    apiFetch(`/api/volunteering-lb/sessions/${id}`, { method: 'DELETE' }),
}
