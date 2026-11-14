import { useEffect, useState } from 'react'

export interface Route {
  path: string[]
  query: URLSearchParams
}

/** Decode one path segment; a malformed escape such as "%E0%A4" is kept as typed so it reaches the not-found page. */
function decodeSegment(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  const [p, q = ''] = h.split('?')
  return { path: p.split('/').filter(Boolean).map(decodeSegment), query: new URLSearchParams(q) }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function href(path: (string | number)[], query?: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  const q = qs.toString()
  return `#/${path.map((s) => encodeURIComponent(String(s))).join('/')}${q ? `?${q}` : ''}`
}

export function navigate(path: (string | number)[], query?: Record<string, string | number | undefined | null>, replace = false) {
  const h = href(path, query)
  if (replace) window.history.replaceState(null, '', h)
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'))
  else window.location.hash = h
}

/** Update query params of the current route without adding history entries. */
export function setQuery(updates: Record<string, string | number | undefined | null>) {
  const r = parseHash(window.location.hash)
  const q: Record<string, string> = {}
  r.query.forEach((v, k) => (q[k] = v))
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined || v === null || v === '') delete q[k]
    else q[k] = String(v)
  }
  navigate(r.path, q, true)
}
