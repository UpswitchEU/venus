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
}: UsePreSelectedMethodSessionSyncParams): void {
  const { preSelectedMethod, selectedMethod } = useManualResultsStore(
    (s) => ({
      preSelectedMethod: s.preSelectedMethod,
      selectedMethod: s.selectedMethod,
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

      const { preSelectedMethod: pre, selectedMethod: sel } = useManualResultsStore.getState()
      const valueToStore = toSessionPreSelectedFieldValue(pre, sel)

      void (async () => {
        try {
          await updateSessionData({
            [SESSION_PRE_SELECTED_VALUATION_METHOD_KEY]: valueToStore,
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
    useManualResultsStore
      .getState()
      .setPreSelectedMethod(
        sanitizePreSelectedValuationMethod(
          initialSelectedMethodFromUrl,
          firmCountryCode,
          currentYearRevenue
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
  ])
}
