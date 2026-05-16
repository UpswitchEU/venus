'use client'

/**
 * useStartupSessionSync
 * ---------------------
 *
 * Studio v2 mirror of `useFormSessionSync` — bidirectional bridge
 * between `useStartupValuationStore` and the canonical `useSessionStore`
 * pipeline that the SME methods (DCF / SaaS / NAV / Adaptive) already
 * use to restore + autosave per-report form state.
 *
 * One hook handles both directions:
 *
 *   1. **`?reset=1`** — wipes the Studio store on partner deep-link or
 *      "Start a new valuation" CTA, then strips the URL param so a
 *      hard refresh doesn't keep wiping the founder's typing.
 *
 *   2. **Restore** — when the SME `SessionRestorationService` finishes
 *      hydrating for the current report id, looks for a `startup_inputs`
 *      object on the session payload (several known shapes are
 *      tolerated for forward-compat with Titan schema migrations) and
 *      applies it via `useStartupValuationStore.applyFromSnapshot`.
 *      The baseline signature for autosave is captured AT THIS POINT
 *      so the first post-restore Zustand emission doesn't bounce back
 *      to Titan as a write loop.
 *
 *   3. **Autosave** — subscribes to the Studio store, debounces 500ms
 *      (same window as the SME autosave), serialises via
 *      `toRequestPayload()`, dedupes on signature, then writes to
 *      `session.sessionData.startup_inputs` and persists via
 *      `saveSession('autosave')`.  Flushes on `beforeunload` and
 *      component unmount so a founder closing the tab mid-edit always
 *      has the latest snapshot in Titan.
 *
 * The single-hook design avoids the cross-hook ref coordination
 * (`skipNextFromRestoreRef`, `previousRestorationRef`) the prior
 * two-hook architecture needed to suppress the restore write loop —
 * here, the baseline signature alone fully describes "what the server
 * already has", so any deviation is by definition a founder edit.
 *
 * Mounted from `StartupValuationPanel` so it only runs when the
 * unified panel is active inside `ManualLayout`.
 */

import { useParams } from 'next/navigation'
import { useEffect, useMemo, useRef } from 'react'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { useSessionStore } from '@/store/useSessionStore'
import { debounceWithFlush } from '@/utils/debounce'
import { consumeLandingStudioHandoff } from '@/utils/landingStudioHandoff'
import { generalLogger } from '@/utils/logger'

const RESET_QUERY_KEY = 'reset'
const RESET_QUERY_VALUE = '1'
const PREFILL_FROM_QUERY_KEY = 'prefill_from'
const PREFILL_FROM_LANDING_VALUE = 'landing'
const AUTOSAVE_DEBOUNCE_MS = 500

/**
 * Walk several known locations on the session payload to find a
 * `startup_inputs` object.  Returns the first non-empty match, or
 * `null` when nothing matches.  Key priority mirrors the order Titan
 * is most likely to ship the field under as the schema settles.
 */
function locateStartupInputs(
  sessionData: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!sessionData) return null
  const direct = sessionData.startup_inputs
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as Record<string, unknown>
  }
  const candidates: Array<unknown> = [
    (sessionData.formData as Record<string, unknown> | undefined)?.startup_inputs,
    (sessionData.form_data as Record<string, unknown> | undefined)?.startup_inputs,
    (sessionData.request as Record<string, unknown> | undefined)?.startup_inputs,
    (sessionData.last_request as Record<string, unknown> | undefined)?.startup_inputs,
    (sessionData.original_request as Record<string, unknown> | undefined)?.startup_inputs,
  ]
  for (const c of candidates) {
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      return c as Record<string, unknown>
    }
  }
  return null
}

function safeSignature(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload)
  } catch {
    // Some payload shape is non-serialisable — fall back to a coarse
    // signature so we still autosave eventually.
    return String(Object.keys(payload).length)
  }
}

export function useStartupSessionSync(): void {
  const params = useParams<{ id?: string }>()
  const reportId = params?.id?.trim() || null

  const restorationComplete = useSessionStore((s) => s.restorationComplete)
  const session = useSessionStore((s) => s.session)

  // Baseline signature — represents "what's on the server right now".
  // Set during restoration; updated after each successful autosave;
  // cleared on report-id change.  Any Studio-store emission whose
  // signature doesn't match the baseline is by definition a founder
  // edit and must be persisted.
  const baselineRef = useRef<{ reportId: string; signature: string } | null>(null)
  const restoredForReportRef = useRef<string | null>(null)

  // ------------------------------------------------------------------
  // 0. `?prefill_from=landing` — consume the anonymous-landing handoff.
  //    Runs before `?reset=1` (a deliberately-fresh-start nukes any
  //    handoff) and before the Titan session-restore (which has nothing
  //    server-side for a never-seen-before founder).  Strips the URL
  //    param after consume so a hard refresh doesn't try again with
  //    the now-empty localStorage entry.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return
    const search = new URLSearchParams(window.location.search)
    if (search.get(PREFILL_FROM_QUERY_KEY) !== PREFILL_FROM_LANDING_VALUE) return
    // ``?reset=1`` always wins — a fresh start should never inherit a
    // stale landing snapshot.  We still strip ``prefill_from`` so the
    // URL doesn't keep advertising a state we ignored.
    if (search.get(RESET_QUERY_KEY) === RESET_QUERY_VALUE) {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete(PREFILL_FROM_QUERY_KEY)
        window.history.replaceState({}, '', url.toString())
      } catch {
        // older browsers — non-fatal
      }
      return
    }
    const handoff = consumeLandingStudioHandoff()
    if (handoff) {
      try {
        useStartupValuationStore.getState().applyFromSnapshot(handoff.studio)
      } catch (err) {
        generalLogger.warn('[StartupSessionSync] Landing handoff: studio apply failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      try {
        // ``updateFormData`` is the canonical setter for the manual
        // identity store; it merges so we only push the keys the
        // landing actually captured (company_name, country_code,
        // kbo_number, legal_form, nace_code/description,
        // business_type_id, industry).  Anything else stays whatever
        // the bootstrap had populated.
        useManualFormStore
          .getState()
          .updateFormData(
            handoff.formData as Parameters<
              ReturnType<typeof useManualFormStore.getState>['updateFormData']
            >[0]
          )
      } catch (err) {
        generalLogger.warn('[StartupSessionSync] Landing handoff: formData apply failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete(PREFILL_FROM_QUERY_KEY)
      window.history.replaceState({}, '', url.toString())
    } catch {
      // older browsers — non-fatal
    }
  }, [])

  // ------------------------------------------------------------------
  // 1. `?reset=1` — exactly once on mount.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return
    const search = new URLSearchParams(window.location.search)
    if (search.get(RESET_QUERY_KEY) !== RESET_QUERY_VALUE) return
    useStartupValuationStore.getState().reset()
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete(RESET_QUERY_KEY)
      window.history.replaceState({}, '', url.toString())
    } catch {
      // older browsers — non-fatal
    }
  }, [])

  // ------------------------------------------------------------------
  // 2. Restore — apply the session's `startup_inputs` once per
  //    (reportId, restoration) tuple, then capture the baseline so the
  //    autosave subscription doesn't re-persist what we just received.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!restorationComplete) return
    if (!reportId) return
    if (!session || session.reportId !== reportId) return
    if (restoredForReportRef.current === reportId) return
    restoredForReportRef.current = reportId

    const startupInputs = locateStartupInputs(
      session.sessionData as Record<string, unknown> | null | undefined
    )
    if (startupInputs) {
      useStartupValuationStore.getState().applyFromSnapshot(startupInputs)
    }
    // Capture baseline AFTER apply (or after no-op) so the very next
    // Studio-store emission compared to this signature is what the
    // founder typed, not what the server replayed.
    const current = useStartupValuationStore.getState().toRequestPayload()
    baselineRef.current = { reportId, signature: safeSignature(current) }
  }, [restorationComplete, reportId, session])

  // ------------------------------------------------------------------
  // 3. Autosave — debounced write to `session.sessionData.startup_inputs`
  //    via `updateSessionData` + `saveSession('autosave')`.
  // ------------------------------------------------------------------
  // `useMemo` (not `useRef`) so the debounce window resets cleanly when
  // the report id changes — without this, a debounce queued on report A
  // could land after we've navigated to report B.
  const debouncedAutosave = useMemo(
    () =>
      debounceWithFlush(async (payload: Record<string, unknown>, ridArg: string) => {
        try {
          const {
            updateSessionData,
            saveSession,
            session: liveSession,
          } = useSessionStore.getState()
          if (!liveSession || liveSession.reportId !== ridArg) return
          await updateSessionData({ startup_inputs: payload })
          await saveSession('autosave')
        } catch (err) {
          generalLogger.warn('[StartupSessionSync] Autosave failed (will retry on next change)', {
            reportId: ridArg,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }, AUTOSAVE_DEBOUNCE_MS),
    []
  )

  useEffect(() => {
    if (!reportId) return
    // Reset baseline when the report id flips so the new report's
    // first edit always fires a save (and we don't dedupe against
    // stale signatures from the previous report).
    if (baselineRef.current?.reportId !== reportId) {
      baselineRef.current = null
    }

    const unsubscribe = useStartupValuationStore.subscribe(() => {
      const payload = useStartupValuationStore.getState().toRequestPayload()
      const signature = safeSignature(payload)
      const baseline = baselineRef.current
      if (baseline && baseline.reportId === reportId && baseline.signature === signature) {
        return
      }
      baselineRef.current = { reportId, signature }
      void debouncedAutosave(payload, reportId)
    })

    return () => unsubscribe()
  }, [reportId, debouncedAutosave])

  // ------------------------------------------------------------------
  // 4. Flush pending writes on tab close + component unmount so a
  //    founder navigating away mid-edit doesn't lose the last debounced
  //    change.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return
    const flush = () => {
      try {
        debouncedAutosave.flush?.()
      } catch {
        // best-effort during unload
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [debouncedAutosave])
}
