/**
 * Shared client-side analytics context for Venus.
 *
 * Mirrors `apps/mercury/shared/lib/analytics-context.ts` so the same GA4
 * dimensions (`traffic_type`, `locale`) are present on every event from both
 * apps. Venus is the cross-app valuation engine — every Venus surface is, by
 * definition, an authenticated *app* surface (no marketing pages live here).
 * We still go through this helper to keep the contract uniform and to leave
 * room for future surfaces that warrant a different classification (e.g. a
 * public preview).
 *
 * Safe on the server: returns sensible defaults when `window` is undefined.
 */

export type TrafficType = 'marketing' | 'app' | 'internal'
export type AnalyticsLocale = 'nl' | 'en' | 'unknown'

export interface AnalyticsContext {
  traffic_type: TrafficType
  locale: AnalyticsLocale
}

const NL_PATH_RE = /^\/(nl)(\/|$)/i
const EN_PATH_RE = /^\/(en)(\/|$)/i

export function detectLocaleFromPath(pathname: string | null | undefined): AnalyticsLocale {
  if (!pathname || !pathname.startsWith('/')) return 'unknown'
  if (NL_PATH_RE.test(pathname)) return 'nl'
  if (EN_PATH_RE.test(pathname)) return 'en'
  return 'unknown'
}

export function getCurrentLocale(): AnalyticsLocale {
  if (typeof window === 'undefined') return 'unknown'
  try {
    return detectLocaleFromPath(window.location.pathname)
  } catch {
    return 'unknown'
  }
}

/**
 * Every Venus surface is an authenticated app surface (the valuation engine
 * never ships public marketing copy). We keep the function so cross-app
 * dashboards can split Mercury marketing/app and Venus app cleanly.
 */
export function classifyTrafficType(_pathname: string | null | undefined): TrafficType {
  return 'app'
}

export function getAnalyticsContext(pathname?: string | null): AnalyticsContext {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  return {
    traffic_type: classifyTrafficType(path),
    locale: detectLocaleFromPath(path),
  }
}
