/**
 * Unified Normalization Store
 *
 * Single source of truth for all normalization state in Venus.
 * Replaces both `useEbitdaNormalizationStore` (year-keyed) and inline
 * `unifiedNormalizations` state in ManualLayout.
 *
 * Persistence:
 * - Auto-syncs to session JSONB (debounced 300ms)
 * - Persists to Titan API on accept/reject (sequential multi-year persists; mutations serialized per session in the API client)
 * - Loads from Titan API on session restoration
 * - Flushes on beforeunload (localStorage fallback) and visibilitychange (tab hidden)
 *
 * @module store/useNormalizationStore
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import {
  getMercurySourceApp,
  getSessionAutosaveDeferRemainingMs,
} from '../hooks/formSessionAutosaveDefer'
import { isUpstreamPoolPressureHttpStatus } from '../hooks/sessionPoolPressureCircuit'
import { NormalizationAPIError } from '../services/ebitdaNormalizationService'
import {
  readBrowserRecoveryValue,
  removeBrowserRecoveryValue,
  writeBrowserRecoveryValue,
} from '../utils/browserRecoveryStorage'
import { generalLogger } from '../utils/logger'
import { appliesToYear } from '../utils/normalizationMath'
import { isValidSessionId } from '../utils/sessionIdValidation'
import {
  acceptNormalizationItem,
  acceptNormalizationItems,
  addUniqueNormalizationItems,
  buildTitanNormalizationRequest,
  computeNormalizedEbitda,
  extractSessionNormalizationItems,
  isNormalizationItem,
  mapTitanNormalizationsToItems,
  rejectNormalizationItem,
  rejectNormalizationItems,
  removeNormalizationItem,
  selectAcceptedNormalizations,
  selectNormalizationsByYear,
  selectPendingNormalizations,
  selectRejectedNormalizations,
  sumNormalizationAdjustments,
  updateNormalizationItem,
} from './normalizationStoreModel'
import { SessionJsonbAutosaveCoordinator } from './sessionJsonbAutosaveCoordinator'
import { useSessionStore } from './useSessionStore'

export {
  mapBackendCategoryToFrontend,
  mapFrontendCategoryToBackend,
} from './normalizationStoreModel'

// ─────────────────────────────────────────
// STORE INTERFACE
// ─────────────────────────────────────────

/** Last failed persist params for retry */
export type LastFailedPersist = { reportId: string; year: number; reportedEbitda?: number } | null

interface NormalizationStore {
  // State
  items: NormalizationItem[]
  isLoading: boolean
  isSaving: boolean
  lastFailedPersist: LastFailedPersist

  // Actions — mutate items
  setItems: (items: NormalizationItem[]) => void
  addItems: (items: NormalizationItem[]) => void
  removeItem: (id: string) => void
  updateItem: (id: string, partial: Partial<NormalizationItem>) => void
  acceptItem: (id: string) => void
  rejectItem: (id: string) => void
  bulkAccept: (ids: string[]) => void
  bulkReject: (ids: string[]) => void
  clear: () => void

  // Persistence actions
  persistToSession: (reportId: string) => Promise<void>
  persistToTitan: (reportId: string, year: number, reportedEbitda?: number) => Promise<void>
  /** Persist all accepted items for given years to Titan. Call before calculate. */
  persistAllToTitan: (
    reportId: string,
    originalEBITDAByYear: Record<number, number>,
    years: number[]
  ) => Promise<void>
  retryPersist: () => Promise<void>
  loadFromTitan: (sessionId: string) => Promise<void>
  loadFromSession: (sessionData: unknown) => void

  // Selectors (call as functions)
  getAccepted: () => NormalizationItem[]
  getPending: () => NormalizationItem[]
  getRejected: () => NormalizationItem[]
  getByYear: (year: number) => NormalizationItem[]
  getTotalAdjustment: () => number
  getAcceptedTotalAdjustment: () => number
  getNormalizedEbitda: (originalEbitda: number) => number
}

// ─────────────────────────────────────────
// TOAST I18N — set by ManualLayout or provider so store can show translated toasts
// ─────────────────────────────────────────

type ToastMessageKey =
  | 'normalizationNotSaved'
  | 'normalizationNotSavedDesc'
  | 'normalizationConflictDesc'
  | 'normalizationNotSavedRetry'
  | 'normalizationNotSavedSession'

type ToastMessageGetter = (key: ToastMessageKey) => string

let toastMessageGetter: ToastMessageGetter | null = null

export function setNormalizationToastMessages(getter: ToastMessageGetter | null) {
  toastMessageGetter = getter
}

const TOAST_FALLBACKS: Record<ToastMessageKey, string> = {
  normalizationNotSaved: 'Adjustments not saved',
  normalizationNotSavedDesc:
    'Your adjustments are saved locally. Sync will be retried automatically.',
  normalizationConflictDesc:
    'Another update finished first (e.g. valuation or sync). Retrying automatically…',
  normalizationNotSavedRetry: 'Retry now',
  normalizationNotSavedSession:
    'Session not found. Calculate your valuation first or refresh the page.',
}

function getToastMessage(key: ToastMessageKey, error?: unknown): string {
  if (key === 'normalizationNotSavedDesc' && error instanceof NormalizationAPIError) {
    if (error.status === 404) {
      return (
        toastMessageGetter?.('normalizationNotSavedSession') ??
        TOAST_FALLBACKS.normalizationNotSavedSession
      )
    }
    if (error.status === 409) {
      return (
        toastMessageGetter?.('normalizationConflictDesc') ??
        TOAST_FALLBACKS.normalizationConflictDesc
      )
    }
  }
  return toastMessageGetter?.(key) ?? TOAST_FALLBACKS[key]
}

// ─────────────────────────────────────────
// STORE
// ─────────────────────────────────────────

export const useNormalizationStore = create<NormalizationStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      items: [],
      isLoading: false,
      isSaving: false,
      lastFailedPersist: null,

      // ─── Mutate ───

      setItems: (items) => set({ items }, false, 'setItems'),

      addItems: (newItems) =>
        set(
          (state) => ({ items: addUniqueNormalizationItems(state.items, newItems) }),
          false,
          'addItems'
        ),

      removeItem: (id) =>
        set((state) => ({ items: removeNormalizationItem(state.items, id) }), false, 'removeItem'),

      updateItem: (id, partial) =>
        set(
          (state) => ({ items: updateNormalizationItem(state.items, id, partial) }),
          false,
          'updateItem'
        ),

      acceptItem: (id) =>
        set(
          (state) => ({
            items: state.items.map((n) => (n.id === id ? acceptNormalizationItem(n) : n)),
          }),
          false,
          'acceptItem'
        ),

      rejectItem: (id) =>
        set(
          (state) => ({
            items: state.items.map((n) => (n.id === id ? rejectNormalizationItem(n) : n)),
          }),
          false,
          'rejectItem'
        ),

      bulkAccept: (ids) =>
        set(
          (state) => ({ items: acceptNormalizationItems(state.items, ids) }),
          false,
          'bulkAccept'
        ),

      bulkReject: (ids) =>
        set(
          (state) => ({ items: rejectNormalizationItems(state.items, ids) }),
          false,
          'bulkReject'
        ),

      clear: () => set({ items: [] }, false, 'clear'),

      // ─── Persistence ───

      persistToSession: async (reportId) => {
        if (!reportId) return
        const sessionState = useSessionStore.getState()
        const deferRemainingMs = getSessionAutosaveDeferRemainingMs({
          reportId,
          restorationComplete: sessionState.restorationComplete,
          sessionStatus: sessionState.status,
          sourceApp: getMercurySourceApp(),
        })
        if (deferRemainingMs > 0) return

        const { session, updateSessionData, saveSession } = sessionState
        if (!session || session.reportId !== reportId) return

        const { items } = get()
        await updateSessionData({ _normalizations: items })
        await saveSession('autosave')
        generalLogger.debug('[NormalizationStore] Persisted to session', {
          reportId: reportId.substring(0, 12),
          count: items.length,
        })
      },

      persistToTitan: async (reportId, year, reportedEbitda) => {
        if (!reportId || !isValidSessionId(reportId)) return
        try {
          const { items } = get()
          set({ isSaving: true, lastFailedPersist: null })
          const doPersist = async (): Promise<void> => {
            const { normalizationService } = await import('../services/ebitdaNormalizationService')
            const request = buildTitanNormalizationRequest({
              items,
              reportId,
              reportedEbitda,
              year,
            })
            await normalizationService.saveNormalization(request)
          }
          const isRetryable = (err: unknown): boolean => {
            if (err instanceof NormalizationAPIError) {
              if (err.status === 409) return true
              const code =
                err.details && typeof err.details === 'object' && 'code' in err.details
                  ? (err.details as { code?: string }).code
                  : undefined
              if (code === 'NORMALIZATION_SNAPSHOT_CONFLICT') return true
              if (isUpstreamPoolPressureHttpStatus(err.status)) return false
              return err.status >= 500
            }
            if (err instanceof TypeError) return true
            return false
          }
          const backoffMs = (err: unknown, attempt: number): number => {
            if (err instanceof NormalizationAPIError && err.status === 409) {
              return Math.min(100 + 120 * attempt, 450)
            }
            return 1000
          }
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
          let lastError: unknown
          for (let attempt = 0; attempt <= 2; attempt++) {
            try {
              await doPersist()
              generalLogger.debug('[NormalizationStore] Persisted to Titan API', {
                reportId: reportId.substring(0, 12),
                year,
                count: get().items.filter((n) => n.status === 'accepted').length,
              })
              return
            } catch (error) {
              lastError = error
              if (attempt < 2 && isRetryable(error)) {
                generalLogger.debug('[NormalizationStore] Retrying persist', {
                  attempt: attempt + 1,
                  status: error instanceof NormalizationAPIError ? error.status : undefined,
                })
                await sleep(backoffMs(error, attempt))
              } else {
                break
              }
            }
          }
          set({ lastFailedPersist: { reportId, year, reportedEbitda } })
          generalLogger.warn('[NormalizationStore] Titan persist failed (non-blocking)', {
            error: lastError instanceof Error ? lastError.message : String(lastError),
          })
          import('sonner')
            .then(({ toast }) => {
              const retryPersist = useNormalizationStore.getState().retryPersist
              toast.warning(getToastMessage('normalizationNotSaved'), {
                description: getToastMessage('normalizationNotSavedDesc', lastError),
                duration: 8000,
                action: {
                  label: getToastMessage('normalizationNotSavedRetry'),
                  onClick: () => retryPersist(),
                },
              })
            })
            .catch((err) => {
              generalLogger.debug('[NormalizationStore] Toast display failed (non-critical)', {
                error: err instanceof Error ? err.message : String(err),
              })
            })
        } finally {
          set({ isSaving: false })
          normalizationSessionAutosave.flushPendingVisibilityPersist()
        }
      },

      retryPersist: async () => {
        const { lastFailedPersist } = get()
        if (!lastFailedPersist) return
        const { reportId, year, reportedEbitda } = lastFailedPersist
        set({ lastFailedPersist: null })
        await get().persistToTitan(reportId, year, reportedEbitda)
      },

      persistAllToTitan: async (reportId, originalEBITDAByYear, years) => {
        if (!reportId || !isValidSessionId(reportId)) return
        const { items, persistToTitan: persistYear } = get()
        const accepted = items.filter((n) => n.status === 'accepted')
        if (accepted.length === 0) return

        const yearsToPersist = years.filter((year) => accepted.some((n) => appliesToYear(n, year)))
        if (yearsToPersist.length === 0) return

        for (const year of yearsToPersist) {
          await persistYear(reportId, year, originalEBITDAByYear[year] ?? 0)
        }
      },

      loadFromTitan: async (sessionId) => {
        if (!sessionId || !isValidSessionId(sessionId)) return
        set({ isLoading: true })
        try {
          const { normalizationService } = await import('../services/ebitdaNormalizationService')
          const responses = await normalizationService.getAllNormalizations(sessionId)
          if (!responses || responses.length === 0) {
            set({ isLoading: false })
            return
          }

          const items = mapTitanNormalizationsToItems(responses)

          set({ items, isLoading: false })
          generalLogger.info('[NormalizationStore] Loaded from Titan', {
            sessionId: sessionId.substring(0, 12),
            count: items.length,
          })
        } catch (error) {
          generalLogger.warn('[NormalizationStore] Titan load failed (non-blocking)', {
            error: error instanceof Error ? error.message : String(error),
          })
          set({ isLoading: false })
        }
      },

      loadFromSession: (sessionData) => {
        const items = extractSessionNormalizationItems(sessionData)
        if (items.length === 0) return
        set({ items })
        generalLogger.debug('[NormalizationStore] Loaded from session data', {
          count: items.length,
        })
      },

      // ─── Selectors ───

      getAccepted: () => selectAcceptedNormalizations(get().items),
      getPending: () => selectPendingNormalizations(get().items),
      getRejected: () => selectRejectedNormalizations(get().items),
      getByYear: (year) => selectNormalizationsByYear(get().items, year),
      getTotalAdjustment: () => sumNormalizationAdjustments(get().items),
      getAcceptedTotalAdjustment: () =>
        sumNormalizationAdjustments(selectAcceptedNormalizations(get().items)),
      getNormalizedEbitda: (originalEbitda) => computeNormalizedEbitda(originalEbitda, get().items),
    }),
    { name: 'normalization-store' }
  )
)

// ─────────────────────────────────────────
// LOCAL-STORAGE SAFETY NET
// Synchronous fallback for beforeunload — survives even if the
// network request started by the debounced persist hasn't completed.
// ─────────────────────────────────────────

const LS_PENDING_PREFIX = '_norm_pending_'

function saveToLocalStorage(reportId: string, items: NormalizationItem[]) {
  writeBrowserRecoveryValue(`${LS_PENDING_PREFIX}${reportId}`, items)
}

function clearLocalStorage(reportId: string) {
  removeBrowserRecoveryValue(`${LS_PENDING_PREFIX}${reportId}`)
}

/**
 * Recover normalizations that were buffered to localStorage during a
 * previous beforeunload but never persisted to the session backend.
 * Call during session restoration, after loadFromSession / loadFromTitan.
 */
export function recoverPendingNormalizations(reportId: string): NormalizationItem[] | null {
  if (!reportId || typeof window === 'undefined') return null
  const items = readBrowserRecoveryValue<unknown[]>(
    `${LS_PENDING_PREFIX}${reportId}`,
    (value): value is unknown[] => Array.isArray(value)
  )
  if (!items) return null

  const normalized = items.filter(isNormalizationItem)
  if (normalized.length > 0) {
    clearLocalStorage(reportId)
    return normalized
  }

  clearLocalStorage(reportId)
  return null
}

// ─────────────────────────────────────────
// AUTO-PERSIST SUBSCRIPTION
// Debounced session persist on any item change.
// Includes beforeunload flush via localStorage for data safety.
// ─────────────────────────────────────────

const normalizationSessionAutosave = new SessionJsonbAutosaveCoordinator<
  NormalizationStore,
  NormalizationItem
>({
  storeName: 'NormalizationStore',
  getItems: () => useNormalizationStore.getState().items,
  selectItems: (state) => state.items,
  subscribe: (listener) => useNormalizationStore.subscribe(listener),
  persistToSession: (reportId) => useNormalizationStore.getState().persistToSession(reportId),
  saveRecoveryBuffer: saveToLocalStorage,
  clearRecoveryBuffer: clearLocalStorage,
  isVisibilityPersistBlocked: () => useNormalizationStore.getState().isSaving,
})

/**
 * Call this once with the current reportId to enable auto-persist.
 * Returns an unsubscribe function that also removes the beforeunload/visibilitychange handlers.
 */
export function enableNormalizationAutoPersist(getReportId: () => string | undefined) {
  return normalizationSessionAutosave.enable(getReportId)
}
