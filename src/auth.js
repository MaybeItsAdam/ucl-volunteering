import { useState, useEffect } from 'react'

const TOKEN_KEY = 'vol_auth_token'
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function signIn() {
  const returnTo = window.location.origin
  window.location.href = `${API_BASE}/api/auth/ucl?return_to=${encodeURIComponent(returnTo)}`
}

export function signOut() {
  clearToken()
  window.location.reload()
}

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user)
        else clearToken()
      })
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  return { user, loading }
}
