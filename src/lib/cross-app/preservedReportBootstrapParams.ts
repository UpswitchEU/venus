/**
 * Query keys that MUST survive Venus `/[locale]/reports/new` → fresh report redirect
 * and SHOULD be the only keys forwarded from `/[locale]/calculator` → `/reports/new`
 * (or to `/reports/[id]` when `reportId` is present).
 *
 * Keep this list aligned with regression tests:
 * - `app/[locale]/reports/new/page.test.ts`
 * - `app/[locale]/calculator/page.test.ts`
 *
 * Encoding: values use `encodeURIComponent` (not `URLSearchParams`), so spaces are
 * `%20` — matches historical Mercury/Venus deep links and existing snapshots.
 */
export const PRESERVED_REPORT_BOOTSTRAP_PARAM_KEYS = [
  'prefilledQuery',
  'clientToken',
  /** Short-lived Mercury → Venus SSO handoff (`navigateToVenus` token exchange). */
  'token',
  'clientId',
  /** Query locale hint (Mercury emits alongside path `/nl/...`); forward-safe for `/reports/new` redirect. */
  'locale',
  'session_key',
  'flow',
  'mode',
  'source',
  'return_url',
  'guestSessionId',
  'embedded',
  'drawer',
  /** One-shot assistant intent, e.g. Mercury approved "start valuation" → Venus auto-prompts. */
  'agent_next',
  'spotlight',
  'focusField',
  'flagYear',
  /** Historic report version (advisor restore); survives `/calculator` → `/reports/[id]`. */
  'version',
  'selected_method',
  'startup_stage',
  /** Legacy studio routing (`/waarderen` → `?flow=startup&studio=legacy`). */
  'studio',
  'benchmark_contribution',
  'action',
  'tab',
  'partner',
  /**
   * Anonymous landing → signup → authenticated Venus handoff marker.
   * Set by the public ``/[locale]/landing/startup`` page so the
   * authenticated bootstrap on ``/reports/[id]`` knows to consume the
   * localStorage handoff snapshot before the calculation auto-fires.
   * Today only ``"landing"`` is meaningful; reserved as an enum so
   * future entry surfaces (embedded Mercury calculator, partner site)
   * can plumb through without grabbing a second param.
   */
  'prefill_from',
] as const

export type PreservedReportBootstrapParamKey =
  (typeof PRESERVED_REPORT_BOOTSTRAP_PARAM_KEYS)[number]

/**
 * Build `?a=1&b=2` from allowlisted keys in Next `searchParams`, or `''` if none.
 * Omits empty strings; uses first entry when the value is an array.
 */
export function buildPreservedReportBootstrapQueryString(
  sp: Record<string, string | string[] | undefined>,
): string {
  const segments: string[] = []
  for (const key of PRESERVED_REPORT_BOOTSTRAP_PARAM_KEYS) {
    const raw = sp[key]
    if (raw == null) continue
    const str = Array.isArray(raw) ? raw[0] : raw
    if (str == null || str === '') continue
    segments.push(`${key}=${encodeURIComponent(String(str))}`)
  }
  return segments.length > 0 ? `?${segments.join('&')}` : ''
}
