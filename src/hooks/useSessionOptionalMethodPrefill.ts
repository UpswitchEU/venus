/**
 * Gap-fill DCF / NAV / SaaS / multiples prep from raw `session.sessionData` into the
 * manual form store when slots are still empty.
 *
 * Runs when `useSessionDataPrefill` is skipped (bootstrap prefilled, or form already
 * has identity rows) but Mercury/Titan still attach method fields to the session blob
 * (manual reports, client invites, and Hermes/integration payloads use the same merge).
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
 * still triggers gap-fill once figures arrive.
 *
 * @module hooks/useSessionOptionalMethodPrefill
 */

import { useEffect } from 'react'

import { useManualFormStore } from '../store/manual'
import { useSessionStore } from '../store/useSessionStore'
import {
  getSessionOptionalPrefillSignature,
  mergeOptionalSessionPrefillFields,
  mergeSessionSurfaceForOptionalPrefill,
} from '../utils/mergeOptionalSessionPrefillFields'

export function useSessionOptionalMethodPrefill(): void {
  const reportId = useSessionStore((s) => s.session?.reportId)
  const restorationComplete = useSessionStore((s) => s.restorationComplete)
  const optionalPrefillSignature = useSessionStore((s) =>
    getSessionOptionalPrefillSignature(s.session?.sessionData)
  )

  useEffect(() => {
    if (!reportId || reportId === 'new') return
    if (!restorationComplete) return
    if (!optionalPrefillSignature) return

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (!useSessionStore.getState().restorationComplete) return

      const raw = useSessionStore.getState().session?.sessionData
      if (!raw || typeof raw !== 'object') return

      const merged = mergeSessionSurfaceForOptionalPrefill(raw)
      const patch = mergeOptionalSessionPrefillFields(
        merged,
        useManualFormStore.getState().formData
      )
      if (Object.keys(patch).length === 0) return
      useManualFormStore.getState().updateFormData(patch)
    })

    return () => {
      cancelled = true
    }
  }, [reportId, optionalPrefillSignature, restorationComplete])
}
