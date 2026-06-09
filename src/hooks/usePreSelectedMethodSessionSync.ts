'use client'

/**
 * Keeps upfront valuation method preference in sync with session JSONB and optional URL seed.
 *
 * - **SSR**: Client-only hook; calculator shell uses `dynamic(..., { ssr: false })`. `selected_method`
 *   must come from server `searchParams` → `urlParams` (no `useSearchParams` here).
 * - **Order**: URL seed runs in `useLayoutEffect` (after `restorationComplete`) so it wins over
 *   child `useEffect` hooks (e.g. Studio auto-calculate); persisted session keys still win over `?selected_method=`.
 * - **Persist**: Debounced flush reads `getState()` so the last toggle wins.
 *
 * @module hooks/usePreSelectedMethodSessionSync
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { sanitizeMethodSelection } from '../constants/methodFieldConfig'
import {
  SESSION_PRE_SELECTED_METHODS_KEY,
  SESSION_PRE_SELECTED_VALUATION_METHOD_KEY,
  SESSION_USER_WEIGHT_JUSTIFICATION_KEY,
  SESSION_USER_WEIGHTS_KEY,
  sanitizePreSelectedValuationMethod,
  sessionHasStoredPreSelectedMethod,
  toSessionPreSelectedFieldValue,
} from '../constants/sessionUiKeys'
import { useManualResultsStore } from '../store/manual/useManualResultsStore'
import { useSessionStore } from '../store/useSessionStore'
import { generalLogger } from '../utils/logger'
import {
  clearRestorationObserved,
  getMercurySourceApp,
  getSessionAutosaveDeferRemainingMs,
  observeMercuryDelegatedRestoration,
} from './formSessionAutosaveDefer'

const PERSIST_DEBOUNCE_MS = 450

export interface UsePreSelectedMethodSessionSyncParams {
  reportId: string | undefined
  resolvedReportId: string | undefined
  restorationComplete: boolean
  /** Server-serialized `urlParams.selected_method` */
  initialSelectedMethodFromUrl: string | undefined
  /** Server-serialized `urlParams.selected_methods` */
  initialSelectedMethodsFromUrl?: string | undefined
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

function sanitizePreSelectedValuationMethodsFromUrl(
  raw: string | null | undefined,
  firmCountryCode?: string | null,
  currentYearRevenue?: number | null,
  allowedMethodsForNav?: readonly string[] | null
): string[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const methods: string[] = []
  for (const token of raw.split(',')) {
    const normalizedToken = token
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
    if (!normalizedToken) continue
    if (normalizedToken === 'upswitch_adaptive') {
      methods.push('upswitch_adaptive')
      continue
    }
    const method = sanitizePreSelectedValuationMethod(
      normalizedToken,
      firmCountryCode,
      currentYearRevenue,
      allowedMethodsForNav
    )
    if (method) methods.push(method)
  }
  const unique = methods.filter((method, index) => methods.indexOf(method) === index)
  if (unique.length === 0) return null
  return sanitizeMethodSelection(unique)
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
  initialSelectedMethodsFromUrl,
  firmCountryCode,
  currentYearRevenue,
  hasValuationResult,
  allowedMethodsForNav,
}: UsePreSelectedMethodSessionSyncParams): void {
  const manualMethodPrefs = useManualResultsStore(
    useShallow((s) => ({
      preSelectedMethod: s.preSelectedMethod,
      selectedMethod: s.selectedMethod,
      preSelectedMethods: s.preSelectedMethods,
      userWeights: s.userWeights,
      userWeightJustification: s.userWeightJustification,
    }))
  )

  const urlSeedDoneRef = useRef(false)
  const lastReportKeyRef = useRef<string | null>(null)
  const persistRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reportKey = resolvedReportId || reportId
  const reportKeyRef = useRef(reportKey)
  reportKeyRef.current = reportKey
  const persistTriggerKey = JSON.stringify({
    preSelectedMethod: manualMethodPrefs.preSelectedMethod,
    selectedMethod: manualMethodPrefs.selectedMethod,
    preSelectedMethods: manualMethodPrefs.preSelectedMethods,
    userWeights: manualMethodPrefs.userWeights,
    userWeightJustification: manualMethodPrefs.userWeightJustification,
  })

  useEffect(() => {
    if (!restorationComplete) {
      clearRestorationObserved(reportKey)
      return
    }
    observeMercuryDelegatedRestoration({
      reportId: reportKey,
      restorationComplete: true,
      sourceApp: getMercurySourceApp(),
    })
  }, [restorationComplete, reportKey])

  const runPersist = useCallback(() => {
    const activeReportKey = reportKeyRef.current
    const sessionState = useSessionStore.getState()
    const { session, updateSessionData, saveSession } = sessionState
    if (!session?.reportId || !activeReportKey || session.reportId !== activeReportKey) return 0

    const deferRemainingMs = getSessionAutosaveDeferRemainingMs({
      reportId: activeReportKey,
      restorationComplete: true,
      sessionStatus: sessionState.status,
      sourceApp: getMercurySourceApp(),
    })
    if (deferRemainingMs > 0) {
      return Number.isFinite(deferRemainingMs) ? deferRemainingMs : 0
    }

    const store = useManualResultsStore.getState()
    const valueToStore = toSessionPreSelectedFieldValue(
      store.preSelectedMethod,
      store.selectedMethod
    )

    const sd =
      session.sessionData && typeof session.sessionData === 'object'
        ? (session.sessionData as Record<string, unknown>)
        : undefined
    const storedMethod = sd?.[SESSION_PRE_SELECTED_VALUATION_METHOD_KEY]
    const storedMethods = sd?.[SESSION_PRE_SELECTED_METHODS_KEY]
    const storedWeights = sd?.[SESSION_USER_WEIGHTS_KEY]
    const storedJustification = sd?.[SESSION_USER_WEIGHT_JUSTIFICATION_KEY]

    const methodsMatch =
      JSON.stringify(storedMethods ?? null) === JSON.stringify(store.preSelectedMethods)
    const weightsMatch =
      JSON.stringify(storedWeights ?? null) ===
      JSON.stringify(Object.keys(store.userWeights).length > 0 ? store.userWeights : null)
    const justificationMatch = (storedJustification ?? '') === (store.userWeightJustification || '')
    const methodFieldMatch = storedMethod === valueToStore

    if (methodFieldMatch && methodsMatch && weightsMatch && justificationMatch) {
      return 0
    }

    void (async () => {
      try {
        await updateSessionData({
          [SESSION_PRE_SELECTED_VALUATION_METHOD_KEY]: valueToStore,
          [SESSION_PRE_SELECTED_METHODS_KEY]: store.preSelectedMethods,
          [SESSION_USER_WEIGHTS_KEY]:
            Object.keys(store.userWeights).length > 0 ? store.userWeights : null,
          [SESSION_USER_WEIGHT_JUSTIFICATION_KEY]: store.userWeightJustification || null,
        })
        await saveSession('autosave')
      } catch (e) {
        generalLogger.warn('[usePreSelectedMethodSessionSync] Persist failed', {
          error: e instanceof Error ? e.message : String(e),
        })
      }
    })()
    return 0
  }, [])

  // Persist (debounced)
  useEffect(() => {
    if (!restorationComplete) return
    const id = resolvedReportId || reportId
    if (!id || id === 'new') return
    // Dependency trigger only: the debounced persist reads the latest store snapshot.
    const scheduledPreferenceSnapshot = persistTriggerKey

    const handle = setTimeout(() => {
      void scheduledPreferenceSnapshot
      const deferRemainingMs = runPersist()
      if (deferRemainingMs > 0) {
        if (persistRetryTimerRef.current) clearTimeout(persistRetryTimerRef.current)
        persistRetryTimerRef.current = setTimeout(() => {
          persistRetryTimerRef.current = null
          runPersist()
        }, deferRemainingMs + 25)
      }
    }, PERSIST_DEBOUNCE_MS)

    return () => {
      clearTimeout(handle)
      if (persistRetryTimerRef.current) {
        clearTimeout(persistRetryTimerRef.current)
        persistRetryTimerRef.current = null
      }
    }
  }, [restorationComplete, resolvedReportId, reportId, persistTriggerKey, runPersist])

  // URL seed: reset per report, then apply at most once when conditions hold.
  //
  // **useLayoutEffect** (not useEffect): Mercury / Studio deep-links ship
  // `?selected_method=startup_valuation` so the report shell swaps to the
  // venture panel.  That swap must happen *before* child passive effects
  // (e.g. Studio v2 auto-calculate) run — otherwise a descendant effect
  // could theoretically fire in the same flush while the store still reads
  // `upswitch_adaptive`.  Layout effects run synchronously after DOM
  // mutations and before `useEffect`, guaranteeing the method is seeded
  // before any `useEffect` in descendants.
  useLayoutEffect(() => {
    if (lastReportKeyRef.current !== reportKey) {
      lastReportKeyRef.current = reportKey ?? null
      urlSeedDoneRef.current = false
    }

    if (urlSeedDoneRef.current) return
    const hasSelectedMethodSeed = Boolean(initialSelectedMethodFromUrl?.trim())
    const hasSelectedMethodsSeed = Boolean(initialSelectedMethodsFromUrl?.trim())
    if (!restorationComplete || (!hasSelectedMethodSeed && !hasSelectedMethodsSeed)) return
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
    const methodListSeed = sanitizePreSelectedValuationMethodsFromUrl(
      initialSelectedMethodsFromUrl,
      firmCountryCode,
      currentYearRevenue,
      allowedMethodsForNav
    )
    if (methodListSeed && methodListSeed.length > 0) {
      useManualResultsStore.getState().setPreSelectedMethods(methodListSeed)
    } else {
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
    }
    urlSeedDoneRef.current = true
  }, [
    reportKey,
    restorationComplete,
    initialSelectedMethodFromUrl,
    initialSelectedMethodsFromUrl,
    hasValuationResult,
    firmCountryCode,
    currentYearRevenue,
    allowedMethodsForNav,
  ])
}
