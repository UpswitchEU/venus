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
import {
  readBrowserRecoveryValue,
  removeBrowserRecoveryValue,
  writeBrowserRecoveryValue,
} from '../utils/browserRecoveryStorage'
import { deepEqual } from '../utils/deepEqual'
import { generalLogger } from '../utils/logger'
import { appliesToYear } from '../utils/normalizationMath'
import type { PersistenceOutcome } from '../utils/persistenceOutcome'
import { reportAccessScope, watchReportAccessScope } from '../utils/reportAccessScope'
import { isValidSessionId } from '../utils/sessionIdValidation'
import {
  type NormalizationMutation,
  NormalizationPersistenceQueue,
} from './normalizationPersistenceQueue'
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
  pendingMutations: NormalizationMutation[]
  recoveryBuffered: boolean

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
  persistToSession: (reportId: string) => Promise<PersistenceOutcome>
  persistToTitan: (
    reportId: string,
    year: number,
    reportedEbitda?: number
  ) => Promise<PersistenceOutcome>
  deleteFromTitan: (reportId: string, year: number) => Promise<PersistenceOutcome>
  /** Persist all accepted items for given years to Titan. Call before calculate. */
  persistAllToTitan: (
    reportId: string,
    originalEBITDAByYear: Record<number, number>,
    years: number[]
  ) => Promise<PersistenceOutcome>
  retryPersist: (reportId?: string) => Promise<PersistenceOutcome>
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

function getNormalizationSessionPersistDeferRemainingMs(reportId: string): number {
  const sessionState = useSessionStore.getState()
  return getSessionAutosaveDeferRemainingMs({
    reportId,
    restorationComplete: sessionState.restorationComplete,
    sessionStatus: sessionState.status,
    sourceApp: getMercurySourceApp(),
  })
}

// ─────────────────────────────────────────
// STORE
// ─────────────────────────────────────────

export const useNormalizationStore = create<NormalizationStore>()(
  devtools<NormalizationStore>(
    (set, get) => ({
      // Initial state
      items: [],
      isLoading: false,
      isSaving: false,
      lastFailedPersist: null,
      pendingMutations: [],
      recoveryBuffered: false,

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

      clear: () => {
        normalizationMutations.clear()
        set({ items: [], lastFailedPersist: null, recoveryBuffered: false }, false, 'clear')
      },

      // ─── Persistence ───

      persistToSession: async (reportId) => {
        if (!reportId) return { status: 'skipped' }
        const sessionState = useSessionStore.getState()
        const { session, updateSessionData, saveSession } = sessionState
        if (!session || session.reportId !== reportId) return { status: 'skipped' }
        const { items } = get()
        if (
          sessionState.restorationComplete &&
          sessionState.status === 'loaded' &&
          !sessionState.hasUnsavedChanges &&
          !sessionState.isSaving &&
          !sessionState.saveFailure &&
          deepEqual(
            (session.sessionData as Record<string, unknown> | undefined)?._normalizations,
            items
          ) &&
          !get().pendingMutations.some(
            (p) => p.reportId === reportId && p.scope === reportAccessScope()
          )
        ) {
          clearLocalStorage(reportId)
          return { status: 'acknowledged' }
        }
        const deferRemainingMs = getNormalizationSessionPersistDeferRemainingMs(reportId)
        if (deferRemainingMs > 0) return { status: 'skipped' }
        const access = watchReportAccessScope()
        try {
          await updateSessionData({ _normalizations: items })
          if (!access.isCurrent() || useSessionStore.getState().session?.reportId !== reportId)
            return { status: 'skipped' }
          const outcome = await saveSession('autosave')
          if (
            outcome.status === 'acknowledged' &&
            access.isCurrent() &&
            get().items === items &&
            useSessionStore.getState().session?.reportId === reportId &&
            !get().pendingMutations.some(
              (p) => p.reportId === reportId && p.scope === reportAccessScope()
            )
          ) {
            clearLocalStorage(reportId)
          }
          return outcome
        } finally {
          access.dispose()
        }
      },

      persistToTitan: async (reportId, year, reportedEbitda) => {
        if (!isValidSessionId(reportId)) return { status: 'skipped' }
        return normalizationMutations.enqueue([
          {
            reportId,
            year,
            operation: 'save',
            request: buildTitanNormalizationRequest({
              items: get().items,
              reportId,
              year,
              reportedEbitda,
            }),
          },
        ])
      },

      deleteFromTitan: async (reportId, year) => {
        if (!isValidSessionId(reportId)) return { status: 'skipped' }
        return normalizationMutations.enqueue([{ reportId, year, operation: 'delete' }])
      },

      retryPersist: async (reportId) => {
        const target = reportId ?? useSessionStore.getState().session?.reportId
        return target ? normalizationMutations.retry(target) : { status: 'skipped' }
      },

      persistAllToTitan: async (reportId, originalEBITDAByYear, years) => {
        if (!isValidSessionId(reportId)) return { status: 'skipped' }
        const { items } = get()
        const accepted = items.filter((n) => n.status === 'accepted')
        return normalizationMutations.enqueue(
          years.map((year) => ({
            reportId,
            year,
            operation: accepted.some((n) => appliesToYear(n, year))
              ? ('save' as const)
              : ('delete' as const),
            request: buildTitanNormalizationRequest({
              items,
              reportId,
              year,
              reportedEbitda: originalEBITDAByYear[year] ?? 0,
            }),
          }))
        )
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

const normalizationMutations = new NormalizationPersistenceQueue((pendingMutations, isSaving) => {
  const failed = pendingMutations.find((item) => item.failure)
  useNormalizationStore.setState({
    pendingMutations,
    isSaving,
    lastFailedPersist: failed
      ? {
          reportId: failed.reportId,
          year: failed.year,
          reportedEbitda: failed.request?.reported_ebitda,
        }
      : null,
  })
  const activeReportId = useSessionStore.getState().session?.reportId
  if (
    activeReportId &&
    (useNormalizationStore.getState().recoveryBuffered ||
      pendingMutations.some(
        (p) => p.reportId === activeReportId && p.scope === reportAccessScope()
      ))
  ) {
    saveToLocalStorage(activeReportId, useNormalizationStore.getState().items)
  }
})

// ─────────────────────────────────────────
// LOCAL-STORAGE SAFETY NET
// Synchronous fallback for beforeunload — survives even if the
// network request started by the debounced persist hasn't completed.
// ─────────────────────────────────────────

const LS_PENDING_PREFIX = '_norm_pending_'
export function normalizationRecoveryKey(reportId: string) {
  return `${LS_PENDING_PREFIX}${reportId}:${encodeURIComponent(reportAccessScope())}`
}

function saveToLocalStorage(reportId: string, items: NormalizationItem[]) {
  const buffered = writeBrowserRecoveryValue(
    `${LS_PENDING_PREFIX}${reportId}:${encodeURIComponent(reportAccessScope())}`,
    {
      scope: reportAccessScope(),
      items,
      mutations: useNormalizationStore
        .getState()
        .pendingMutations.filter((p) => p.reportId === reportId && p.scope === reportAccessScope()),
    }
  )
  useNormalizationStore.setState({ recoveryBuffered: buffered })
  return buffered
}

function clearLocalStorage(reportId: string) {
  const cleared = removeBrowserRecoveryValue(normalizationRecoveryKey(reportId))
  const legacyKey = `${LS_PENDING_PREFIX}${reportId}`
  const legacy = readBrowserRecoveryValue<{ scope: string }>(
    legacyKey,
    (value): value is { scope: string } =>
      !!value && typeof value === 'object' && 'scope' in value && typeof value.scope === 'string',
    { allowLegacy: false }
  )
  const legacyCleared =
    legacy?.scope === reportAccessScope() ? removeBrowserRecoveryValue(legacyKey) : true
  useNormalizationStore.setState({ recoveryBuffered: !cleared || !legacyCleared })
}

/**
 * Recover normalizations that were buffered to localStorage during a
 * previous beforeunload but never persisted to the session backend.
 * Call during session restoration, after loadFromSession / loadFromTitan.
 */
export function recoverPendingNormalizations(reportId: string): NormalizationItem[] | null {
  if (!reportId || typeof window === 'undefined') return null
  const readBuffer = (key: string) =>
    readBrowserRecoveryValue<{
      scope: string
      items: unknown[]
      mutations?: NormalizationMutation[]
    }>(
      key,
      (value): value is { scope: string; items: unknown[] } =>
        !!value &&
        typeof value === 'object' &&
        'scope' in value &&
        typeof value.scope === 'string' &&
        'items' in value &&
        Array.isArray(value.items),
      { allowLegacy: false }
    )
  const saved =
    readBuffer(normalizationRecoveryKey(reportId)) ?? readBuffer(`${LS_PENDING_PREFIX}${reportId}`)
  if (!saved || saved.scope !== reportAccessScope()) return null
  useNormalizationStore.setState({
    items: saved.items.filter(isNormalizationItem),
    recoveryBuffered: true,
  })
  if (Array.isArray(saved.mutations)) {
    normalizationMutations.restore(
      saved.mutations.filter(
        (p) =>
          !!p &&
          typeof p === 'object' &&
          p.reportId === reportId &&
          p.scope === reportAccessScope() &&
          Number.isInteger(p.year) &&
          (p.operation === 'delete' ||
            (p.operation === 'save' &&
              p.request?.session_id === reportId &&
              p.request.year === p.year))
      )
    )
  }
  useNormalizationStore.setState({ recoveryBuffered: true })
  return saved.items.filter(isNormalizationItem)
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
  canClearRecoveryBuffer: (reportId) =>
    !useNormalizationStore
      .getState()
      .pendingMutations.some((p) => p.reportId === reportId && p.scope === reportAccessScope()),
  isVisibilityPersistBlocked: () => useNormalizationStore.getState().isSaving,
  getDeferRemainingMs: getNormalizationSessionPersistDeferRemainingMs,
})

/**
 * Call this once with the current reportId to enable auto-persist.
 * Returns an unsubscribe function that also removes the beforeunload/visibilitychange handlers.
 */
export function enableNormalizationAutoPersist(getReportId: () => string | undefined) {
  return normalizationSessionAutosave.enable(getReportId)
}
