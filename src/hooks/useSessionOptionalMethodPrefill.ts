/**
 * Gap-fill DCF / NAV / SaaS / multiples prep from raw `session.sessionData` into the
 * manual form store when slots are still empty.
 *
 * Runs when `useSessionDataPrefill` is skipped (bootstrap prefilled, or form already
 * has identity rows) but Mercury/Titan still attach method fields to the session blob.
 * Same merge rules as {@link mergeOptionalSessionPrefillFields}.
 *
 * Skips when {@link shouldSuppressMercurySessionPrefill} — authoritative restoration
 * already hydrated the form for this report.
 *
 * Uses `queueMicrotask` so this runs after bootstrap/layout updates in the same tick,
 * reducing duplicate `updateFormData` churn.
 *
 * @module hooks/useSessionOptionalMethodPrefill
 */

import { useEffect } from 'react'

import { useManualFormStore } from '../store/manual'
import { useSessionStore } from '../store/useSessionStore'
import { mergeOptionalSessionPrefillFields } from '../utils/mergeOptionalSessionPrefillFields'
import { shouldSuppressMercurySessionPrefill } from '../utils/prefillRestorationGate'

export function useSessionOptionalMethodPrefill(): void {
  const reportId = useSessionStore((s) => s.session?.reportId)
  const sessionData = useSessionStore((s) => s.session?.sessionData) as Record<string, unknown> | undefined
  useEffect(() => {
    if (!reportId || reportId === 'new') return
    if (shouldSuppressMercurySessionPrefill(reportId)) return
    if (!sessionData || typeof sessionData !== 'object') return

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (shouldSuppressMercurySessionPrefill(reportId)) return

      const bi = (sessionData as { _businessInfo?: Record<string, unknown> })._businessInfo || {}
      const merged = { ...bi, ...sessionData }
      const patch = mergeOptionalSessionPrefillFields(
        merged as Record<string, unknown>,
        useManualFormStore.getState().formData
      )
      if (Object.keys(patch).length === 0) return
      useManualFormStore.getState().updateFormData(patch)
    })

    return () => {
      cancelled = true
    }
  }, [reportId, sessionData])
}
