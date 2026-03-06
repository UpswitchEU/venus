/**
 * Tax Latency Store
 *
 * Manages deferred tax assets/liabilities (belastinglatenties) for equity value adjustment.
 * These are NOT EBITDA normalisations — they adjust the equity bridge:
 *   Active latency (vordering)  → adds to equity value
 *   Passive latency (verplichting) → subtracts from equity value
 *
 * Persistence: auto-syncs to session JSONB via `_taxLatencies` key (debounced 300ms).
 *
 * @module store/useTaxLatencyStore
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { generalLogger } from '../utils/logger'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type TaxLatencyType = 'active' | 'passive'

export interface TaxLatencyItem {
  id: string
  type: TaxLatencyType
  description: string
  temporaryDifference: number
  taxRate: number
}

export function calculateLatencyAmount(item: TaxLatencyItem): number {
  const amount = Math.abs(item.temporaryDifference) * (item.taxRate / 100)
  return item.type === 'active' ? amount : -amount
}

export function getNetTaxLatencyImpact(items: TaxLatencyItem[]): number {
  return items.reduce((sum, item) => sum + calculateLatencyAmount(item), 0)
}

// ─────────────────────────────────────────
// STORE INTERFACE
// ─────────────────────────────────────────

interface TaxLatencyStore {
  items: TaxLatencyItem[]

  addItem: (item: TaxLatencyItem) => void
  removeItem: (id: string) => void
  updateItem: (id: string, partial: Partial<TaxLatencyItem>) => void
  setItems: (items: TaxLatencyItem[]) => void
  clear: () => void

  persistToSession: (reportId: string) => Promise<void>
  loadFromSession: (sessionData: any) => void

  getNetImpact: () => number
}

// ─────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────

let sessionPersistTimer: ReturnType<typeof setTimeout> | null = null
let isSessionPersistInFlight = false
let lastItemsJson = ''

const LS_PENDING_PREFIX = '_taxlat_pending_'

function saveToLocalStorage(reportId: string, items: TaxLatencyItem[]) {
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

export function recoverPendingTaxLatencies(reportId: string): TaxLatencyItem[] | null {
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
// STORE
// ─────────────────────────────────────────

export const useTaxLatencyStore = create<TaxLatencyStore>()(
  devtools(
    (set, get) => ({
      items: [],

      addItem: (item) =>
        set(
          (state) => ({
            items: [...state.items, item],
          }),
          false,
          'addItem'
        ),

      removeItem: (id) =>
        set(
          (state) => ({ items: state.items.filter((i) => i.id !== id) }),
          false,
          'removeItem'
        ),

      updateItem: (id, partial) =>
        set(
          (state) => ({
            items: state.items.map((i) => (i.id === id ? { ...i, ...partial } : i)),
          }),
          false,
          'updateItem'
        ),

      setItems: (items) => set({ items }, false, 'setItems'),

      clear: () => set({ items: [] }, false, 'clear'),

      persistToSession: async (reportId) => {
        if (!reportId) return
        const { items } = get()
        const { sessionService } = await import('../services')
        await sessionService.saveSession(reportId, { _taxLatencies: items } as any)
        generalLogger.debug('[TaxLatencyStore] Persisted to session', {
          reportId: reportId.substring(0, 12),
          count: items.length,
        })
      },

      loadFromSession: (sessionData) => {
        if (!sessionData?._taxLatencies) return
        const stored = sessionData._taxLatencies
        if (Array.isArray(stored) && stored.length > 0) {
          set({ items: stored })
          generalLogger.debug('[TaxLatencyStore] Loaded from session data', {
            count: stored.length,
          })
        }
      },

      getNetImpact: () => getNetTaxLatencyImpact(get().items),
    }),
    { name: 'tax-latency-store' }
  )
)

// ─────────────────────────────────────────
// AUTO-PERSIST SUBSCRIPTION
// ─────────────────────────────────────────

export function enableTaxLatencyAutoPersist(getReportId: () => string | undefined) {
  lastItemsJson = JSON.stringify(useTaxLatencyStore.getState().items)
  let pendingReportId: string | null = null

  const handleBeforeUnload = () => {
    if (sessionPersistTimer) {
      clearTimeout(sessionPersistTimer)
      sessionPersistTimer = null
    }
    const reportId = getReportId()
    if (!reportId) return
    const { items } = useTaxLatencyStore.getState()
    const json = JSON.stringify(items)
    if (json === lastItemsJson && !pendingReportId) return
    saveToLocalStorage(reportId, items)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  const unsubStore = useTaxLatencyStore.subscribe((state) => {
    const json = JSON.stringify(state.items)
    if (json === lastItemsJson) return
    lastItemsJson = json

    const reportId = getReportId()
    if (!reportId) return

    pendingReportId = reportId

    if (sessionPersistTimer) clearTimeout(sessionPersistTimer)
    sessionPersistTimer = setTimeout(async function attemptPersist() {
      if (isSessionPersistInFlight) {
        sessionPersistTimer = setTimeout(attemptPersist, 200)
        return
      }
      isSessionPersistInFlight = true
      try {
        await useTaxLatencyStore.getState().persistToSession(reportId)
        clearLocalStorage(reportId)
        pendingReportId = null
      } catch (error) {
        generalLogger.warn('[TaxLatencyStore] Session persist failed — keeping safety buffer', {
          error: error instanceof Error ? error.message : String(error),
        })
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
