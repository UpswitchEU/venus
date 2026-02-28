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
 * - Flushes pending saves on beforeunload
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
import { generalLogger } from '../utils/logger'

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

interface NormalizationStore {
  // State
  items: NormalizationItem[]
  isLoading: boolean
  isSaving: boolean

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
  persistToTitan: (reportId: string, year: number) => Promise<void>
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

type ToastMessageGetter = (key: 'normalizationNotSaved' | 'normalizationNotSavedDesc') => string

let toastMessageGetter: ToastMessageGetter | null = null

export function setNormalizationToastMessages(getter: ToastMessageGetter | null) {
  toastMessageGetter = getter
}

function getToastMessage(key: 'normalizationNotSaved' | 'normalizationNotSavedDesc'): string {
  return (
    toastMessageGetter?.(key) ??
    (key === 'normalizationNotSaved'
      ? 'Normalization not saved to server'
      : 'Your changes are saved locally. Server sync will be retried.')
  )
}

// ─────────────────────────────────────────
// PERSISTENCE GUARDS
// Prevent concurrent persist operations and data loss.
// ─────────────────────────────────────────

let sessionPersistTimer: ReturnType<typeof setTimeout> | null = null
let isSessionPersistInFlight = false
let pendingSessionReportId: string | null = null

const titanPersistQueue = new Map<string, Promise<void>>()

function getTitanQueueKey(reportId: string, year: number) {
  return `${reportId}:${year}`
}

/**
 * Serialize Titan persist calls per reportId+year.
 * If a persist is already in-flight for this key, the new call waits for it to finish
 * then runs with the latest state (preventing stale-state overwrites).
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

      persistToTitan: async (reportId, year) => {
        if (!reportId) return
        await serializedPersistToTitan(reportId, year, async () => {
          // Read latest state INSIDE the serialized executor to avoid stale snapshots
          const { items } = get()
          set({ isSaving: true })
          try {
            const { normalizationService } = await import('../services/ebitdaNormalizationService')
            const yearItems = items.filter((n) => {
              if (n.status !== 'accepted') return false
              if (n.applyAllYears) return true
              if (n.applyYears && n.applyYears.length > 0) return n.applyYears.includes(year)
              return n.year === year
            })
            const adjustments = yearItems.map((n) => ({
              category: mapFrontendCategoryToBackend(n.category),
              amount: Number(n.adjustment),
              note: n.reason,
              confidence: n.confidence,
              ledger_code: n.ledgerCode || undefined,
              ledger_name: n.ledgerName || undefined,
            }))
            await normalizationService.saveNormalization({
              session_id: reportId,
              year,
              reported_ebitda: 0,
              adjustments,
            } as any)
            generalLogger.debug('[NormalizationStore] Persisted to Titan API', {
              reportId: reportId.substring(0, 12),
              year,
              count: yearItems.length,
            })
          } catch (error) {
            generalLogger.warn('[NormalizationStore] Titan persist failed (non-blocking)', {
              error: error instanceof Error ? error.message : String(error),
            })
            import('sonner')
              .then(({ toast }) => {
                toast.warning(getToastMessage('normalizationNotSaved'), {
                  description: getToastMessage('normalizationNotSavedDesc'),
                  duration: 5000,
                })
              })
              .catch(() => {})
          } finally {
            set({ isSaving: false })
          }
        })
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

          const items: NormalizationItem[] = []
          for (const resp of responses) {
            for (const adj of resp.adjustments || []) {
              items.push({
                id: `titan-${resp.year}-${adj.category}-${Math.random().toString(36).substring(2, 8)}`,
                ledgerCode: adj.ledger_code || '',
                ledgerName: adj.ledger_name || adj.note || adj.category,
                category: mapBackendCategoryToFrontend(adj.category),
                type: adj.amount >= 0 ? 'add' : 'subtract',
                value: Math.abs(adj.amount),
                adjustment: adj.amount,
                reason: adj.note,
                source: 'manual' as NormalizationSource,
                sourceRef: '',
                status: 'accepted' as NormalizationStatus,
                applyAllYears: false,
                year: resp.year,
                confidence: adj.confidence as any,
              })
            }
            for (const custom of resp.custom_adjustments || []) {
              items.push({
                id:
                  custom.id ||
                  `titan-custom-${resp.year}-${Math.random().toString(36).substring(2, 8)}`,
                ledgerCode: custom.ledger_code || '',
                ledgerName: custom.ledger_name || custom.description,
                category: 'other',
                type: custom.amount >= 0 ? 'add' : 'subtract',
                value: Math.abs(custom.amount),
                adjustment: custom.amount,
                reason: custom.note,
                source: 'manual' as NormalizationSource,
                sourceRef: '',
                status: 'accepted' as NormalizationStatus,
                applyAllYears: false,
                year: resp.year,
              })
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
      getByYear: (year) => get().items.filter((n) => n.year === year),
      getTotalAdjustment: () => get().items.reduce((sum, n) => sum + Number(n.adjustment), 0),
      getAcceptedTotalAdjustment: () =>
        get()
          .items.filter((n) => n.status === 'accepted')
          .reduce((sum, n) => sum + Number(n.adjustment), 0),
      getNormalizedEbitda: (originalEbitda) =>
        Number(originalEbitda) +
        get()
          .items.filter((n) => n.status === 'accepted')
          .reduce((sum, n) => sum + Number(n.adjustment), 0),
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

/**
 * Call this once with the current reportId to enable auto-persist.
 * Returns an unsubscribe function that also removes the beforeunload handler.
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

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
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
      isSessionPersistInFlight = true
      try {
        await useNormalizationStore.getState().persistToSession(reportId)
        // Only clear safety buffers on confirmed success
        clearLocalStorage(reportId)
        pendingSessionReportId = null
      } catch (error) {
        generalLogger.warn('[NormalizationStore] Session persist failed — keeping safety buffer', {
          error: error instanceof Error ? error.message : String(error),
        })
        // pendingSessionReportId stays set → beforeunload will write to localStorage
      } finally {
        isSessionPersistInFlight = false
      }
    }, 300)
  })

  return () => {
    unsubStore()
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
    if (sessionPersistTimer) {
      clearTimeout(sessionPersistTimer)
      sessionPersistTimer = null
    }
  }
}
