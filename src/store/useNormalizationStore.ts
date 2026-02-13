/**
 * Unified Normalization Store
 *
 * Single source of truth for all normalization state in Venus.
 * Replaces both `useEbitdaNormalizationStore` (year-keyed) and inline
 * `unifiedNormalizations` state in ManualLayout.
 *
 * Persistence:
 * - Auto-syncs to session JSONB (debounced 500ms)
 * - Persists to Titan API on accept/reject (immediate)
 * - Loads from Titan API on session restoration
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
// DEBOUNCE HELPER
// ─────────────────────────────────────────

let sessionPersistTimer: ReturnType<typeof setTimeout> | null = null

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
          'addItems',
        ),

      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((n) => n.id !== id) }), false, 'removeItem'),

      updateItem: (id, partial) =>
        set(
          (state) => ({
            items: state.items.map((n) => (n.id === id ? { ...n, ...partial } : n)),
          }),
          false,
          'updateItem',
        ),

      acceptItem: (id) =>
        set(
          (state) => ({
            items: state.items.map((n) =>
              n.id === id ? { ...n, status: 'accepted' as NormalizationStatus } : n,
            ),
          }),
          false,
          'acceptItem',
        ),

      rejectItem: (id) =>
        set(
          (state) => ({
            items: state.items.map((n) =>
              n.id === id ? { ...n, status: 'rejected' as NormalizationStatus } : n,
            ),
          }),
          false,
          'rejectItem',
        ),

      bulkAccept: (ids) =>
        set(
          (state) => ({
            items: state.items.map((n) =>
              ids.includes(n.id) ? { ...n, status: 'accepted' as NormalizationStatus } : n,
            ),
          }),
          false,
          'bulkAccept',
        ),

      bulkReject: (ids) =>
        set(
          (state) => ({
            items: state.items.map((n) =>
              ids.includes(n.id) ? { ...n, status: 'rejected' as NormalizationStatus } : n,
            ),
          }),
          false,
          'bulkReject',
        ),

      clear: () => set({ items: [] }, false, 'clear'),

      // ─── Persistence ───

      persistToSession: async (reportId) => {
        if (!reportId) return
        const { items } = get()
        try {
          const { sessionService } = await import('../services')
          await sessionService.saveSession(reportId, { _normalizations: items } as any)
          generalLogger.debug('[NormalizationStore] Persisted to session', {
            reportId: reportId.substring(0, 12),
            count: items.length,
          })
        } catch (error) {
          generalLogger.warn('[NormalizationStore] Session persist failed (non-blocking)', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },

      persistToTitan: async (reportId, year) => {
        if (!reportId) return
        const { items } = get()
        set({ isSaving: true })
        try {
          const { normalizationService } = await import('../services/ebitdaNormalizationService')
          const yearItems = items.filter((n) => n.year === year)
          const adjustments = yearItems.map((n) => ({
            category: mapFrontendCategoryToBackend(n.category),
            amount: n.adjustment,
            note: n.reason,
            confidence: n.confidence,
            ledger_code: n.ledgerCode || undefined,
            ledger_name: n.ledgerName || undefined,
          }))
          await normalizationService.saveNormalization({
            session_id: reportId,
            year,
            reported_ebitda: 0, // Will be calculated server-side
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
          // Import toast dynamically to avoid circular deps
          import('sonner').then(({ toast }) => {
            toast.warning('Normalisatie niet opgeslagen op server', {
              description: 'Uw wijzigingen zijn lokaal bewaard. Server-opslag wordt opnieuw geprobeerd.',
              duration: 5000,
            })
          }).catch(() => {})
        } finally {
          set({ isSaving: false })
        }
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
                id: custom.id || `titan-custom-${resp.year}-${Math.random().toString(36).substring(2, 8)}`,
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
      getTotalAdjustment: () => get().items.reduce((sum, n) => sum + n.adjustment, 0),
      getAcceptedTotalAdjustment: () =>
        get()
          .items.filter((n) => n.status === 'accepted')
          .reduce((sum, n) => sum + n.adjustment, 0),
      getNormalizedEbitda: (originalEbitda) =>
        originalEbitda +
        get()
          .items.filter((n) => n.status === 'accepted')
          .reduce((sum, n) => sum + n.adjustment, 0),
    }),
    { name: 'normalization-store' },
  ),
)

// ─────────────────────────────────────────
// AUTO-PERSIST SUBSCRIPTION
// Debounced session persist on any item change.
// ─────────────────────────────────────────

let lastItemsJson = ''

/**
 * Call this once with the current reportId to enable auto-persist.
 * Returns an unsubscribe function.
 */
export function enableNormalizationAutoPersist(getReportId: () => string | undefined) {
  return useNormalizationStore.subscribe((state) => {
    const json = JSON.stringify(state.items)
    if (json === lastItemsJson) return
    lastItemsJson = json

    const reportId = getReportId()
    if (!reportId) return

    // Debounced session persist
    if (sessionPersistTimer) clearTimeout(sessionPersistTimer)
    sessionPersistTimer = setTimeout(() => {
      useNormalizationStore.getState().persistToSession(reportId)
    }, 500)
  })
}
