export const TOKEN_KEY = 'openfox_token'

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = readToken()
  return fetch(url, { ...init, headers: { ...init.headers, ...(token ? { 'x-session-token': token } : {}) } })
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await authFetch(url)
  if (!response.ok) throw new Error(`${url} failed (${response.status})`)
  return (await response.json()) as T
}

export function sendJson(url: string, method: 'POST' | 'PUT', body: unknown): Promise<Response> {
  return authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
