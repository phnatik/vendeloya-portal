// Calls to the backend's protected API. Every request carries the session token from
// sign-in as a Bearer token; a 401 means it expired or was revoked.

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) || 'https://api.vendeloya.ai/api/v1'

export class UnauthorizedError extends Error {}

export const apiGet = async <T>(path: string, token: string): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) throw new UnauthorizedError('Your session has expired. Please sign in again.')
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Request failed (${response.status})`)
  }
  return payload.data as T
}

// Builds ?a=1&b=2 from the non-empty values only.
export const query = (params: Record<string, string | boolean | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false)
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : ''
}
