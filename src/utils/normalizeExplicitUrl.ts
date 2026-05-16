/**
 * Normalize env-supplied URLs (Mercury parent, Titan API base) for Venus.
 * Scheme-less hosts use https, except loopback which uses http.
 */

/** Marketing canonical — matches Mercury `MERCURY_SITE_ORIGIN_CANONICAL`. */
export const MERCURY_SITE_WWW_CANONICAL = 'https://www.upswitch.app' as const

function isSchemelessLoopback(raw: string): boolean {
  const hostPart = raw.split('/')[0].toLowerCase()
  return hostPart.startsWith('localhost') || hostPart.startsWith('127.0.0.1')
}

/**
 * Parse env to an origin string (no path). Returns null if empty or invalid.
 */
export function tryNormalizeToOrigin(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed.length) return null

  let candidate = trimmed
  if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
    candidate = isSchemelessLoopback(trimmed) ? `http://${trimmed}` : `https://${trimmed}`
  }

  try {
    return new URL(candidate).origin
  } catch {
    return null
  }
}

/**
 * API / BFF base: origin, or origin + path if path was set (no trailing slash).
 */
export function tryNormalizeApiBaseUrl(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed.length) return null

  let candidate = trimmed
  if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
    candidate = isSchemelessLoopback(trimmed) ? `http://${trimmed}` : `https://${trimmed}`
  }

  try {
    const u = new URL(candidate)
    const path = u.pathname.replace(/\/$/, '')
    const base = path && path !== '/' ? `${u.origin}${path}` : u.origin
    return base.replace(/\/$/, '')
  } catch {
    return null
  }
}
