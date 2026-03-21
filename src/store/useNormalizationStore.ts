/**
 * Unified Normalization Store
 *
 * Single source of truth for all normalization state in Venus.
 * Replaces both `useEbitdaNormalizationStore` (year-keyed) and inline
 * `unifiedNormalizations` state in ManualLayout.
 *
 * Persistence:
 * - Auto-syncs to session JSONB (debounced 300ms)
 * - Persists to Titan API on accept/reject (serialized per year)
 * - Loads from Titan API on session restoration
 * - Flushes on beforeunload (localStorage fallback) and visibilitychange (tab hidden)
 *
 * @module store/useNormalizationStore
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  NormalizationItem,
  NormalizationSource,
  NormalizationStatus,
} from '../components/calculator/UnifiedNormalizationModal'
import { NormalizationAPIError } from '../services/ebitdaNormalizationService'
import { generalLogger } from '../utils/logger'
import { appliesToYear } from '../utils/normalizationMath'
import { isValidSessionId } from '../utils/sessionIdValidation'

// ─────────────────────────────────────────
// CATEGORY MAPPING
// ─────────────────────────────────────────

/** Map backend 12-category format back to frontend 7-category display */
const BACKEND_TO_FRONTEND_CATEGORY: Record<string, NormalizationItem['category']> = {
  owner_compensation_adjustment: 'salary',
  one_time_expenses: 'one-time',
  personal_expenses: 'personal',
  related_party_transactions: 'rent',
  non_recurring_revenue: 'other',
  non_recurring_costs: 'one-time',
  depreciation_adjustment: 'depreciation',
  family_expenses: 'personal',
  unusual_transactions: 'other',
  tax_optimization_reversal: 'other',
  discretionary_expenses: 'other',
  other_adjustments: 'other',
}

/** Map frontend 7-category to backend 12-category */
const FRONTEND_TO_BACKEND_CATEGORY: Record<string, string> = {
  salary: 'owner_compensation_adjustment',
  rent: 'related_party_transactions',
  vehicle: 'personal_expenses',
  'one-time': 'one_time_expenses',
  personal: 'personal_expenses',
  depreciation: 'depreciation_adjustment',
  other: 'other_adjustments',
}

export function mapBackendCategoryToFrontend(category: string): NormalizationItem['category'] {
  return BACKEND_TO_FRONTEND_CATEGORY[category] || 'other'
}

export function mapFrontendCategoryToBackend(category: string): string {
  return FRONTEND_TO_BACKEND_CATEGORY[category] || category
}

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
  loadFromSession: (sessionData: any) => void

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
  normalizationNotSavedDesc: 'Your adjustments are saved locally. Sync will be retried automatically.',
  normalizationConflictDesc:
    'Another update finished first (e.g. valuation or sync). Retrying automatically…',
  normalizationNotSavedRetry: 'Retry now',
  normalizationNotSavedSession: 'Session not found. Calculate your valuation first or refresh the page.',
}

function getToastMessage(key: ToastMessageKey, error?: unknown): string {
  if (key === 'normalizationNotSavedDesc' && error instanceof NormalizationAPIError) {
    if (error.status === 404) {
      return toastMessageGetter?.('normalizationNotSavedSession') ?? TOAST_FALLBACKS.normalizationNotSavedSession
    }
    if (error.status === 409) {
      return toastMessageGetter?.('normalizationConflictDesc') ?? TOAST_FALLBACKS.normalizationConflictDesc
    }
  }
  return toastMessageGetter?.(key) ?? TOAST_FALLBACKS[key]
}

// ─────────────────────────────────────────
// PERSISTENCE GUARDS
// Prevent concurrent persist operations and data loss.
// ─────────────────────────────────────────

let sessionPersistTimer: ReturnType<typeof setTimeout> | null = null
let isSessionPersistInFlight = false
let pendingSessionReportId: string | null = null
/** When visibilitychange flush hits an in-flight persist, we defer to run again after it completes */
let pendingVisibilityFlushReportId: string | null = null

const titanPersistQueue = new Map<string, Promise<void>>()

function getTitanQueueKey(reportId: string, year: number) {
  return `${reportId}:${year}`
}

/**
 * Serialize Titan persist calls per reportId+year.
 * If a persist is already in-flight for this key, the new call waits for it to finish
 * then runs with the latest state (preventing stale-state overwrites).
 *
 * NOTE: Session persist (debounced) and Titan persist (on accept/reject) are independent
 * and can run concurrently — both write to different backends.
 */
async function serializedPersistToTitan(
  reportId: string,
  year: number,
  fn: () => Promise<void>
): Promise<void> {
  const key = getTitanQueueKey(reportId, year)
  const prev = titanPersistQueue.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  titanPersistQueue.set(key, next)
  try {
    await next
  } finally {
    if (titanPersistQueue.get(key) === next) {
      titanPersistQueue.delete(key)
    }
  }
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
          (state) => ({
            items: [
              ...state.items,
              ...newItems.filter((n) => !state.items.some((e) => e.id === n.id)),
            ],
          }),
          false,
          'addItems'
        ),

      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((n) => n.id !== id) }), false, 'removeItem'),

      updateItem: (id, partial) =>
        set(
          (state) => ({
            items: state.items.map((n) => (n.id === id ? { ...n, ...partial } : n)),
          }),
          false,
          'updateItem'
        ),

      acceptItem: (id) =>
        set(
          (state) => ({
            items: state.items.map((n) =>
              n.id === id ? { ...n, status: 'accepted' as NormalizationStatus } : n
            ),
          }),
          false,
          'acceptItem'
        ),

      rejectItem: (id) =>
        set(
          (state) => ({
            items: state.items.map((n) =>
              n.id === id ? { ...n, status: 'rejected' as NormalizationStatus } : n
            ),
          }),
          false,
          'rejectItem'
        ),

      bulkAccept: (ids) =>
        set(
          (state) => ({
            items: state.items.map((n) =>
              ids.includes(n.id) ? { ...n, status: 'accepted' as NormalizationStatus } : n
            ),
          }),
          false,
          'bulkAccept'
        ),

      bulkReject: (ids) =>
        set(
          (state) => ({
            items: state.items.map((n) =>
              ids.includes(n.id) ? { ...n, status: 'rejected' as NormalizationStatus } : n
            ),
          }),
          false,
          'bulkReject'
        ),

      clear: () => set({ items: [] }, false, 'clear'),

      // ─── Persistence ───

      persistToSession: async (reportId) => {
        if (!reportId) return
        const { items } = get()
        const { sessionService } = await import('../services')
        await sessionService.saveSession(reportId, { _normalizations: items } as any)
        generalLogger.debug('[NormalizationStore] Persisted to session', {
          reportId: reportId.substring(0, 12),
          count: items.length,
        })
      },

      persistToTitan: async (reportId, year, reportedEbitda) => {
        if (!reportId || !isValidSessionId(reportId)) return
        await serializedPersistToTitan(reportId, year, async () => {
          try {
          const { items } = get()
          set({ isSaving: true, lastFailedPersist: null })
          const doPersist = async (): Promise<void> => {
            const { normalizationService } = await import('../services/ebitdaNormalizationService')
            const yearItems = items.filter((n) => {
              if (n.status !== 'accepted') return false
              if (n.applyAllYears) return true
              if (n.applyYears && n.applyYears.length > 0) return n.applyYears.includes(year)
              return n.year === year
            })
            const rawEbitda = Number(reportedEbitda)
            const yearEbitda = Number.isFinite(rawEbitda) ? rawEbitda : 0
            const adjustments = yearItems.map((n) => {
              const rawAdj = Number(n.adjustment)
              let amount = Number.isFinite(rawAdj) ? rawAdj : 0
              const safeVal = Number.isFinite(n.value) ? n.value : 0
              if (n.type === 'add_percent') amount = (yearEbitda * safeVal) / 100
              else if (n.type === 'subtract_percent') amount = -((yearEbitda * safeVal) / 100)
              else if (n.type === 'absolute') amount = safeVal - yearEbitda
              if (!Number.isFinite(amount)) amount = 0
              return {
                category: mapFrontendCategoryToBackend(n.category),
                amount,
                note: n.reason,
                confidence: n.confidence,
                ledger_code: n.ledgerCode || undefined,
                ledger_name: n.ledgerName || undefined,
                normalization_type: n.type,
                normalization_value: n.value,
                frontend_id: n.id,
                apply_years: n.applyYears,
                apply_all_years: n.applyAllYears,
              }
            })
            await normalizationService.saveNormalization({
              session_id: reportId,
              year,
              reported_ebitda: reportedEbitda ?? 0,
              adjustments,
            } as any)
          }
          const isRetryable = (err: unknown): boolean => {
            if (err instanceof NormalizationAPIError) {
              if (err.status === 409) return true
              const code =
                err.details && typeof err.details === 'object' && 'code' in err.details
                  ? (err.details as { code?: string }).code
                  : undefined
              if (code === 'NORMALIZATION_SNAPSHOT_CONFLICT') return true
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
            if (pendingVisibilityFlushReportId) {
              const next = pendingVisibilityFlushReportId
              pendingVisibilityFlushReportId = null
              void runSessionPersist(next)
            }
          }
        })
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

        const yearsToPersist = years.filter((year) =>
          accepted.some((n) => appliesToYear(n, year))
        )
        if (yearsToPersist.length === 0) return

        await Promise.all(
          yearsToPersist.map((year) =>
            persistYear(reportId, year, originalEBITDAByYear[year] ?? 0)
          )
        )
      },

      loadFromTitan: async (sessionId) => {
        if (!sessionId) return
        set({ isLoading: true })
        try {
          const { normalizationService } = await import('../services/ebitdaNormalizationService')
          const responses = await normalizationService.getAllNormalizations(sessionId)
          if (!responses || responses.length === 0) {
            set({ isLoading: false })
            return
          }

          const seenFrontendIds = new Map<string, NormalizationItem>()
          const items: NormalizationItem[] = []
          for (const resp of responses) {
            for (let idx = 0; idx < (resp.adjustments || []).length; idx++) {
              const adj = resp.adjustments[idx] as any
              const restoredType = adj.normalization_type || (adj.amount >= 0 ? 'add' : 'subtract')
              const restoredValue = adj.normalization_value ?? Math.abs(adj.amount)

              // Deduplicate multi-year normalizations by frontend_id
              if (adj.frontend_id && seenFrontendIds.has(adj.frontend_id)) {
                continue
              }

              const item: NormalizationItem = {
                id: adj.frontend_id || `titan-${resp.year}-${adj.category}-${idx}`,
                ledgerCode: adj.ledger_code || '',
                ledgerName: adj.ledger_name || adj.note || adj.category,
                category: mapBackendCategoryToFrontend(adj.category),
                type: restoredType,
                value: restoredValue,
                adjustment: adj.amount,
                reason: adj.note,
                source: 'manual' as NormalizationSource,
                sourceRef: '',
                status: 'accepted' as NormalizationStatus,
                applyAllYears: adj.apply_all_years ?? false,
                applyYears: adj.apply_years,
                year: resp.year,
                confidence: adj.confidence as any,
              }

              if (adj.frontend_id) seenFrontendIds.set(adj.frontend_id, item)
              items.push(item)
            }
            for (let idx = 0; idx < (resp.custom_adjustments || []).length; idx++) {
              const custom = resp.custom_adjustments[idx] as any

              if (custom.frontend_id && seenFrontendIds.has(custom.frontend_id)) {
                continue
              }

              const item: NormalizationItem = {
                id: custom.frontend_id || custom.id || `titan-custom-${resp.year}-${idx}`,
                ledgerCode: custom.ledger_code || '',
                ledgerName: custom.ledger_name || custom.description,
                category: 'other',
                type: custom.normalization_type || (custom.amount >= 0 ? 'add' : 'subtract'),
                value: custom.normalization_value ?? Math.abs(custom.amount),
                adjustment: custom.amount,
                reason: custom.note,
                source: 'manual' as NormalizationSource,
                sourceRef: '',
                status: 'accepted' as NormalizationStatus,
                applyAllYears: custom.apply_all_years ?? false,
                applyYears: custom.apply_years,
                year: resp.year,
              }

              if (custom.frontend_id) seenFrontendIds.set(custom.frontend_id, item)
              items.push(item)
            }
          }

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
        if (!sessionData?._normalizations) return
        const stored = sessionData._normalizations
        if (Array.isArray(stored) && stored.length > 0) {
          set({ items: stored })
          generalLogger.debug('[NormalizationStore] Loaded from session data', {
            count: stored.length,
          })
        }
      },

      // ─── Selectors ───

      getAccepted: () => get().items.filter((n) => n.status === 'accepted'),
      getPending: () => get().items.filter((n) => n.status === 'pending'),
      getRejected: () => get().items.filter((n) => n.status === 'rejected'),
      getByYear: (year) =>
        get().items.filter(
          (n) => n.applyAllYears || (n.applyYears && n.applyYears.length > 0 ? n.applyYears.includes(year) : n.year === year)
        ),
      getTotalAdjustment: () =>
        get().items.reduce((sum, n) => {
          const adj = Number(n.adjustment)
          return sum + (Number.isFinite(adj) ? adj : 0)
        }, 0),
      getAcceptedTotalAdjustment: () =>
        get()
          .items.filter((n) => n.status === 'accepted')
          .reduce((sum, n) => {
            const adj = Number(n.adjustment)
            return sum + (Number.isFinite(adj) ? adj : 0)
          }, 0),
      getNormalizedEbitda: (originalEbitda) => {
        const base = Number(originalEbitda)
        const safeBase = Number.isFinite(base) ? base : 0
        const totalAdj = get()
          .items.filter((n) => n.status === 'accepted')
          .reduce((sum, n) => {
            const adj = Number(n.adjustment)
            return sum + (Number.isFinite(adj) ? adj : 0)
          }, 0)
        return safeBase + totalAdj
      },
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
  try {
    localStorage.setItem(`${LS_PENDING_PREFIX}${reportId}`, JSON.stringify(items))
  } catch {
    // localStorage may be full or disabled
  }
}

function clearLocalStorage(reportId: string) {
  try {
    localStorage.removeItem(`${LS_PENDING_PREFIX}${reportId}`)
  } catch {
    // ignore
  }
}

/**
 * Recover normalizations that were buffered to localStorage during a
 * previous beforeunload but never persisted to the session backend.
 * Call during session restoration, after loadFromSession / loadFromTitan.
 */
export function recoverPendingNormalizations(reportId: string): NormalizationItem[] | null {
  if (!reportId || typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${LS_PENDING_PREFIX}${reportId}`)
    if (!raw) return null
    const items = JSON.parse(raw)
    if (Array.isArray(items) && items.length > 0) {
      clearLocalStorage(reportId)
      return items
    }
    clearLocalStorage(reportId)
  } catch {
    // ignore parse errors
  }
  return null
}

// ─────────────────────────────────────────
// AUTO-PERSIST SUBSCRIPTION
// Debounced session persist on any item change.
// Includes beforeunload flush via localStorage for data safety.
// ─────────────────────────────────────────

let lastItemsJson = ''

/** Run session persist immediately; used by debounce callback and visibilitychange flush */
async function runSessionPersist(reportId: string): Promise<void> {
  if (isSessionPersistInFlight) {
    pendingVisibilityFlushReportId = reportId
    return
  }
  isSessionPersistInFlight = true
  try {
    await useNormalizationStore.getState().persistToSession(reportId)
    clearLocalStorage(reportId)
    pendingSessionReportId = null
  } catch (error) {
    generalLogger.warn('[NormalizationStore] Session persist failed — keeping safety buffer', {
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    isSessionPersistInFlight = false
    if (pendingVisibilityFlushReportId) {
      const next = pendingVisibilityFlushReportId
      pendingVisibilityFlushReportId = null
      void runSessionPersist(next)
    }
  }
}

/**
 * Call this once with the current reportId to enable auto-persist.
 * Returns an unsubscribe function that also removes the beforeunload/visibilitychange handlers.
 */
export function enableNormalizationAutoPersist(getReportId: () => string | undefined) {
  // Snapshot current items so we don't re-persist data that was just loaded from the backend.
  // Also prevents cross-report leaks where lastItemsJson retained a previous report's value.
  lastItemsJson = JSON.stringify(useNormalizationStore.getState().items)

  const handleBeforeUnload = () => {
    if (sessionPersistTimer) {
      clearTimeout(sessionPersistTimer)
      sessionPersistTimer = null
    }
    const reportId = getReportId()
    if (!reportId) return
    const { items } = useNormalizationStore.getState()
    const json = JSON.stringify(items)
    if (json === lastItemsJson && !pendingSessionReportId) return

    // Synchronous write to localStorage — guaranteed to complete during beforeunload.
    // On next page load, recoverPendingNormalizations() picks this up and persists properly.
    saveToLocalStorage(reportId, items)
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'hidden') return
    const reportId = getReportId()
    if (!reportId) return
    if (sessionPersistTimer) {
      clearTimeout(sessionPersistTimer)
      sessionPersistTimer = null
    }
    const { items, isSaving } = useNormalizationStore.getState()
    const json = JSON.stringify(items)
    if (json === lastItemsJson && !pendingSessionReportId) return
    lastItemsJson = json
    pendingSessionReportId = reportId
    // Defer session persist when Titan persist is in flight to avoid overlapping network ops
    if (isSessionPersistInFlight || isSaving) {
      pendingVisibilityFlushReportId = reportId
      return
    }
    runSessionPersist(reportId)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  const unsubStore = useNormalizationStore.subscribe((state) => {
    const json = JSON.stringify(state.items)
    if (json === lastItemsJson) return
    lastItemsJson = json

    const reportId = getReportId()
    if (!reportId) return

    pendingSessionReportId = reportId

    if (sessionPersistTimer) clearTimeout(sessionPersistTimer)
    sessionPersistTimer = setTimeout(async function attemptPersist() {
      if (isSessionPersistInFlight) {
        sessionPersistTimer = setTimeout(attemptPersist, 200)
        return
      }
      await runSessionPersist(reportId)
    }, 300)
  })

  return () => {
    unsubStore()
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    if (sessionPersistTimer) {
      clearTimeout(sessionPersistTimer)
      sessionPersistTimer = null
    }
  }
}
