'use client'

/**
 * Keeps upfront valuation method preference in sync with session JSONB and optional URL seed.
 *
 * - **SSR**: Client-only hook; calculator shell uses `dynamic(..., { ssr: false })`. `selected_method`
 *   must come from server `searchParams` → `urlParams` (no `useSearchParams` here).
 * - **Order**: URL seed runs only after `restorationComplete`; persisted session keys win over `?selected_method=`.
 * - **Persist**: Debounced flush reads `getState()` so the last toggle wins.
 *
 * @module hooks/usePreSelectedMethodSessionSync
 */

import { useEffect, useRef } from 'react'
import { shallow } from 'zustand/shallow'
import {
  SESSION_PRE_SELECTED_VALUATION_METHOD_KEY,
  SESSION_PRE_SELECTED_METHODS_KEY,
  SESSION_USER_WEIGHTS_KEY,
  SESSION_USER_WEIGHT_JUSTIFICATION_KEY,
  sanitizePreSelectedValuationMethod,
  sessionHasStoredPreSelectedMethod,
  toSessionPreSelectedFieldValue,
} from '../constants/sessionUiKeys'
import { useManualResultsStore } from '../store/manual/useManualResultsStore'
import { useSessionStore } from '../store/useSessionStore'
import { generalLogger } from '../utils/logger'

const PERSIST_DEBOUNCE_MS = 450

export interface UsePreSelectedMethodSessionSyncParams {
  reportId: string | undefined
  resolvedReportId: string | undefined
  restorationComplete: boolean
  /** Server-serialized `urlParams.selected_method` */
  initialSelectedMethodFromUrl: string | undefined
  firmCountryCode: string | null | undefined
  /** Current-year turnover when known (same source as nav); omzet URL seed rejected at €0. */
  currentYearRevenue?: number | null
  hasValuationResult: boolean
  /**
   * Optional narrower allowed-methods list (e.g. owner-founder × firm). When
   * provided, the URL seed is rejected if the requested `selected_method` is
   * not in this list — prevents owners from landing on an "active but
   * invisible" method (e.g. `?selected_method=dcf` for a seller whose nav
   * only renders the 3 owner-founder methods). Defaults to the firm-only
   * list inside `sanitizePreSelectedValuationMethod`.
   */
  allowedMethodsForNav?: readonly string[] | null
}

/**
 * 1) Debounced persist of `_pre_selected_valuation_method`.
 * 2) One-time URL seed per report when no stored preference and no valuation result.
 */
export function usePreSelectedMethodSessionSync({
  reportId,
  resolvedReportId,
  restorationComplete,
  initialSelectedMethodFromUrl,
  firmCountryCode,
  currentYearRevenue,
  hasValuationResult,
  allowedMethodsForNav,
}: UsePreSelectedMethodSessionSyncParams): void {
  const { preSelectedMethod, selectedMethod, preSelectedMethods, userWeights, userWeightJustification } = useManualResultsStore(
    (s) => ({
      preSelectedMethod: s.preSelectedMethod,
      selectedMethod: s.selectedMethod,
      preSelectedMethods: s.preSelectedMethods,
      userWeights: s.userWeights,
      userWeightJustification: s.userWeightJustification,
    }),
    shallow
  )

  const urlSeedDoneRef = useRef(false)
  const lastReportKeyRef = useRef<string | null>(null)

  const reportKey = resolvedReportId || reportId

  // Persist (debounced)
  useEffect(() => {
    if (!restorationComplete) return
    const id = resolvedReportId || reportId
    if (!id || id === 'new') return

    const handle = setTimeout(() => {
      const { session, updateSessionData, saveSession } = useSessionStore.getState()
      if (!session?.reportId) return

      const store = useManualResultsStore.getState()
      const valueToStore = toSessionPreSelectedFieldValue(store.preSelectedMethod, store.selectedMethod)

      void (async () => {
        try {
          await updateSessionData({
            [SESSION_PRE_SELECTED_VALUATION_METHOD_KEY]: valueToStore,
            [SESSION_PRE_SELECTED_METHODS_KEY]: store.preSelectedMethods,
            [SESSION_USER_WEIGHTS_KEY]: Object.keys(store.userWeights).length > 0 ? store.userWeights : null,
            [SESSION_USER_WEIGHT_JUSTIFICATION_KEY]: store.userWeightJustification || null,
          })
          await saveSession('autosave')
        } catch (e) {
          generalLogger.warn('[usePreSelectedMethodSessionSync] Persist failed', {
            error: e instanceof Error ? e.message : String(e),
          })
        }
      })()
    }, PERSIST_DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [
    preSelectedMethod,
    selectedMethod,
    preSelectedMethods,
    userWeights,
    userWeightJustification,
    restorationComplete,
    resolvedReportId,
    reportId,
  ])

  // URL seed: reset per report, then apply at most once when conditions hold
  useEffect(() => {
    if (lastReportKeyRef.current !== reportKey) {
      lastReportKeyRef.current = reportKey ?? null
      urlSeedDoneRef.current = false
    }

    if (urlSeedDoneRef.current) return
    if (!restorationComplete || !initialSelectedMethodFromUrl?.trim()) return
    if (hasValuationResult) {
      urlSeedDoneRef.current = true
      return
    }
    const sd = useSessionStore.getState().session?.sessionData
    if (sessionHasStoredPreSelectedMethod(sd)) {
      urlSeedDoneRef.current = true
      return
    }
    const storeSnap = useManualResultsStore.getState()
    if (
      storeSnap.preSelectedMethods.length > 1 &&
      !storeSnap.preSelectedMethods.includes('upswitch_adaptive')
    ) {
      urlSeedDoneRef.current = true
      return
    }
    useManualResultsStore
      .getState()
      .setPreSelectedMethod(
        sanitizePreSelectedValuationMethod(
          initialSelectedMethodFromUrl,
          firmCountryCode,
          currentYearRevenue,
          allowedMethodsForNav
        )
      )
    urlSeedDoneRef.current = true
  }, [
    reportKey,
    restorationComplete,
    initialSelectedMethodFromUrl,
    hasValuationResult,
    firmCountryCode,
    currentYearRevenue,
    allowedMethodsForNav,
  ])
}
