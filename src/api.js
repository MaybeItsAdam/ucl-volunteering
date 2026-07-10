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

  // Committee — getRibbons doubles as the "is this user committee?" probe
  getRibbons: () => apiFetch('/api/volunteering-lb/ribbons'),
  createOpportunity: (data) =>
    apiFetch('/api/volunteering', { method: 'POST', body: JSON.stringify(data) }),
  updateOpportunity: (id, data) =>
    apiFetch(`/api/volunteering/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
}
