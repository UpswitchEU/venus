/**
 * buildStudioDeepLink — Mercury → Venus URL builder.
 *
 * Single source of truth for the `?` param contract that
 * `CompanyCardStep`'s first-mount `useEffect` consumes (Round 4
 * "Mercury → Venus deep-link prefill expansion"). Anywhere outside
 * Venus that wants to deep-link a founder into a primed studio (the
 * Mercury dashboard CTAs, outbound email magic-links, the
 * "Continue your valuation" cards) should call this helper instead
 * of hand-assembling the query string — that way the contract can
 * never silently drift.
 *
 * Usage:
 *
 *     const url = buildStudioDeepLink('/en/reports/new', {
 *       companyName: 'Henchman',
 *       stage: 'seed',
 *       sector: 'saas',
 *       country: 'BE',
 *       mrr: 12000,
 *       raise: 750_000,
 *       pitch: 'AI assistant for Belgian law firms.',
 *     })
 *     // → '/en/reports/new?selected_method=startup_valuation&companyName=Henchman&stage=seed&…'
 *
 * Returned URLs always include `selected_method=startup_valuation`
 * because the studio panel lives behind that method gate; without it
 * the user lands on the SME calculator and never sees the studio.
 *
 * The helper is intentionally framework-agnostic (no `next/navigation`,
 * no React) so it can run in tests, in API routes, in Mercury's
 * dashboard server components, anywhere.
 */

import {
  isStudioDeepLinkSector,
  isStudioDeepLinkStage,
  normalizeStudioCountryCode,
  type StudioDeepLinkParams,
  type StudioDeepLinkSector,
  type StudioDeepLinkStage,
} from './studioDeepLinkContract'

export type { StudioDeepLinkParams, StudioDeepLinkSector, StudioDeepLinkStage }

/**
 * Build a deep-link URL into the Venus startup studio with optional
 * pre-fill params.
 *
 * @param basePath  Path to the studio entry point. The helper is
 *                  locale-agnostic so callers must include the locale
 *                  segment they want (e.g. `/en/reports/new`).
 * @param params    Pre-fill envelope. Every field is optional. Missing
 *                  / invalid values are silently dropped — the studio
 *                  falls back to its own defaults for them.
 * @returns         Path with `?selected_method=startup_valuation` plus
 *                  every supplied param URL-encoded.
 */
export function buildStudioDeepLink(basePath: string, params: StudioDeepLinkParams = {}): string {
  const usp = new URLSearchParams()
  // Always pin the method gate so the studio panel actually mounts.
  // Without this the URL would land the founder on the SME calculator.
  usp.set('selected_method', 'startup_valuation')

  if (params.companyName) {
    const clean = params.companyName.trim().slice(0, 120)
    if (clean) usp.set('companyName', clean)
  }
  if (isStudioDeepLinkStage(params.stage)) {
    usp.set('stage', params.stage)
  }
  if (isStudioDeepLinkSector(params.sector)) {
    usp.set('sector', params.sector)
  }
  const country = normalizeStudioCountryCode(params.country)
  if (country) usp.set('country', country)
  // Numeric prefills — strict positive-integer parsing so a NaN /
  // negative / over-flow value never lands on the URL.
  const isPositiveInt = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n > 0
  if (isPositiveInt(params.mrr)) usp.set('mrr', String(Math.round(params.mrr)))
  if (isPositiveInt(params.arr)) usp.set('arr', String(Math.round(params.arr)))
  if (isPositiveInt(params.raise)) usp.set('raise', String(Math.round(params.raise)))
  if (params.pitch) {
    const clean = params.pitch.trim().slice(0, 240)
    if (clean) usp.set('pitch', clean)
  }

  const sep = basePath.includes('?') ? '&' : '?'
  return `${basePath}${sep}${usp.toString()}`
}
