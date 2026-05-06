/**
 * Runs after `restorationComplete` when the optional session fingerprint changes — same tick as
 * {@link useSessionDataPrefill} merges identity fields; both funnel method-agnostic patches through
 * {@link queueOptionalGapFillFlush} so optional merge runs at most once per macrotask.
 *
 * Uses {@link mergeOptionalSessionPrefillFields}, which also:
 * - expands `year_data` / `yearData` into `historical_years_data` (integration shape),
 * - applies session `filing_year_confirmed` when normalizing history,
 * - promotes nested `current_year_data` revenue/EBITDA to top-level scalars,
 * - rebuilds `yearlyFinancials` when the grid is still placeholder-only.
 *
 * Runs only after `restorationComplete` so `SessionRestorationService` hydration wins the race.
 * Does not use the Mercury prefill suppression flag: this path only fills empty slots via
 * `mergeOptionalSessionPrefillFields`, so it cannot overwrite a full restore.
 *
 * Re-runs when {@link getSessionOptionalPrefillSignature} changes — value-level
 * fingerprints (not only object identity) so chunk-loaded or merged session JSON
 * still triggers gap-fill once figures arrive. Envelope cardinality + identity anchors
 * prevent the “empty signature” deadlock when only `company_name`/KBO exist first.
 *
 * @module hooks/useSessionOptionalMethodPrefill
 */

import { useEffect } from 'react'

import { useSessionStore } from '../store/useSessionStore'
import { queueOptionalGapFillFlush } from './sessionOptionalGapFillFlush'
import { getSessionOptionalPrefillSignature } from '../utils/mergeOptionalSessionPrefillFields'

/**
 * Existing report only (`reportId !== 'new'`). New reports rely on
 * {@link useBootstrapPrefill} / {@link useBootstrapSync} for first paint.
 */
export function useSessionOptionalMethodPrefill(): void {
  const reportId = useSessionStore((s) => s.session?.reportId)
  const restorationComplete = useSessionStore((s) => s.restorationComplete)
  const optionalPrefillSignature = useSessionStore((s) =>
    getSessionOptionalPrefillSignature(s.session?.sessionData)
  )

  useEffect(() => {
    if (!reportId || reportId === 'new') return
    if (!restorationComplete) return

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      queueOptionalGapFillFlush()
    })

    return () => {
      cancelled = true
    }
  }, [reportId, optionalPrefillSignature, restorationComplete])
}
