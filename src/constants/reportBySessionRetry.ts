/**
 * Backoff schedule for GET /reports/by-session/:key when the report row is not linked yet (404).
 * Used by ReportAPI, SessionResolver, auth accountant context restore, and fetchWithBySession404Retry.
 */
export const BY_SESSION_404_BACKOFF_MS = [0, 400, 1000, 2000, 3500] as const

/** Titan v2 path segment — use for URL checks so logic stays aligned with ReportAPI routes. */
export const API_V2_REPORTS_BY_SESSION_PATH = '/api/v2/valuations/reports/by-session/'

/**
 * Axios stores `baseURL` and relative `url` separately — combine for stable matching in interceptors.
 */
export function buildAxiosEffectiveRequestUrl(config?: { baseURL?: string; url?: string }): string {
  if (!config) return ''
  const rawUrl = (config.url ?? '').trim()
  const base = (config.baseURL ?? '').trim().replace(/\/$/, '')
  if (!rawUrl) return base
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl
  const path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`
  return base ? `${base}${path}` : path
}

/**
 * True when the request targets Titan GET `/api/v2/valuations/reports/by-session/:key`.
 * Handles absolute URLs (pathname only), relative paths, and stray whitespace.
 */
export function isBySessionReportUrl(url: string): boolean {
  if (url == null || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed)
      return u.pathname.includes(API_V2_REPORTS_BY_SESSION_PATH)
    }
  } catch {
    // malformed absolute URL — fall through to substring match
  }
  const noHash = (trimmed.split('#')[0] ?? '').trim()
  // Relative URLs may omit the leading slash; align with buildAxiosEffectiveRequestUrl normalization.
  const probe = /^https?:\/\//i.test(trimmed)
    ? noHash
    : noHash.startsWith('/')
      ? noHash
      : `/${noHash}`
  return probe.includes(API_V2_REPORTS_BY_SESSION_PATH)
}
