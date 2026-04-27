/**
 * Pure URL builders for the post-wizard navigation.
 *
 * Extracted from `StartupStudioPage.handleSubmit` so the URL contract
 * (which is the cross-app interface — Mercury bootstrap fallback,
 * `usePreSelectedMethodSessionSync` method-seeding,
 * `StartupSubmitFooter` auto-fire, `useStartupStudioRedirect`
 * bypass) can be unit-tested directly without mounting the wizard,
 * its router, its session storage, or its persisted Zustand state.
 *
 * Two destinations:
 *
 *   • **Advisor return** — the wizard was entered via the Mercury
 *     hand-off (`?from=advisor` URL signal + sessionStorage handoff
 *     payload).  We push back to the SAME `/reports/{id}` so the
 *     Mercury client record stays linked, and we preserve the Mercury
 *     context verbatim (`mode`, `clientId`, `return_url`,
 *     `source=mercury`) so the bootstrap fallback at
 *     `SessionBootstrapService.ts` can restore the
 *     accountant-for-client identity without a `clientToken`.  The
 *     "wizard done" signal is `studio_completed=1` — NOT
 *     `source=studio_v2`, which would clobber `source=mercury` and
 *     break the bootstrap fallback path.
 *
 *   • **Founder return** — fresh report id via `/reports/new`; the
 *     legacy contract uses `source=studio_v2` for the same auto-fire
 *     and redirect-bypass signals.
 *
 * Both paths set `selected_method=startup_valuation` (the cross-app
 * contract recognised by `usePreSelectedMethodSessionSync`) so the
 * report shell lands on the venture panel rather than the SME default
 * `upswitch_adaptive`.
 */

import type { AdvisorHandoff } from '@/components/calculator/sections/startup/StartupAwareInputPanel'

/**
 * Optional `&partner=…` query suffix already including the leading
 * ampersand (matches the existing `partnerSuffix` shape in
 * `StartupStudioPage`).  An empty string means "no partner attribution".
 */
export type PartnerSuffix = string

export function buildAdvisorReturnUrl(
  handoff: AdvisorHandoff,
  partnerSuffix: PartnerSuffix = ''
): string {
  const qs = new URLSearchParams()
  qs.set('selected_method', 'startup_valuation')
  qs.set('studio_completed', '1')
  if (handoff.mode) qs.set('mode', handoff.mode)
  if (handoff.clientId) qs.set('clientId', handoff.clientId)
  if (handoff.returnUrl) qs.set('return_url', handoff.returnUrl)
  if (handoff.source) qs.set('source', handoff.source)
  const targetLocale = handoff.locale === 'nl' ? 'nl' : 'en'
  return `/${targetLocale}/reports/${handoff.reportId}?${qs.toString()}${partnerSuffix}`
}

export function buildFounderReturnUrl(
  locale: 'en' | 'nl',
  partnerSuffix: PartnerSuffix = ''
): string {
  return `/${locale}/reports/new?selected_method=startup_valuation&source=studio_v2${partnerSuffix}`
}
