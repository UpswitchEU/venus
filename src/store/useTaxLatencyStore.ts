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
  accountCode?: string
  accountName?: string
  description: string
  temporaryDifference: number
  taxRate: number
}

export interface TaxLatencyCandidate {
  id: string
  type: TaxLatencyType
  accountCode: string
  accountName: string
  description: string
  suggestedQuestion: string
  rationale?: string
  temporaryDifference?: number
  taxRate: number
  year?: number
  autoApply?: boolean
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizeTaxLatencyItem(input: unknown): TaxLatencyItem | null {
  if (!input || typeof input !== 'object') return null

  const record = input as Record<string, unknown>
  const id = typeof record.id === 'string' && record.id ? record.id : ''
  if (!id) return null

  return {
    id,
    type: record.type === 'active' ? 'active' : 'passive',
    accountCode:
      typeof record.accountCode === 'string'
        ? record.accountCode
        : typeof record.account_code === 'string'
          ? record.account_code
          : undefined,
    accountName:
      typeof record.accountName === 'string'
        ? record.accountName
        : typeof record.account_name === 'string'
          ? record.account_name
          : undefined,
    description: typeof record.description === 'string' ? record.description : '',
    temporaryDifference: Math.abs(
      toFiniteNumber(
        record.temporaryDifference ??
          record.temporary_difference ??
          record.grossSurplusValue ??
          record.gross_surplus_value,
        0
      )
    ),
    taxRate: Math.min(100, Math.max(0, toFiniteNumber(record.taxRate ?? record.tax_rate, 25))),
  }
}

function normalizeTaxLatencyItems(input: unknown): TaxLatencyItem[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => normalizeTaxLatencyItem(item))
    .filter((item): item is TaxLatencyItem => item !== null)
}

export function calculateLatencyAmount(item: TaxLatencyItem): number {
  const amount = Math.abs(item.temporaryDifference) * (item.taxRate / 100)
  return item.type === 'active' ? amount : -amount
}

export function getNetTaxLatencyImpact(items: TaxLatencyItem[]): number {
  return items.reduce((sum, item) => sum + calculateLatencyAmount(item), 0)
}

/**
 * Format tax latency amounts with 2 decimal places for accounting precision.
 * Guards against NaN/Infinity; returns fallback for invalid values.
 */
export function formatCurrencyTaxLatency(value: number, currencyLocale: string): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(currencyLocale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// ─────────────────────────────────────────
// STORE INTERFACE
// ─────────────────────────────────────────

interface TaxLatencyStore {
  items: TaxLatencyItem[]
  candidates: TaxLatencyCandidate[]

  addItem: (item: TaxLatencyItem) => void
  removeItem: (id: string) => void
  updateItem: (id: string, partial: Partial<TaxLatencyItem>) => void
  setItems: (items: TaxLatencyItem[]) => void
  setCandidates: (candidates: TaxLatencyCandidate[]) => void
  dismissCandidate: (id: string) => void
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
let pendingReportId: string | null = null
let pendingVisibilityFlushReportId: string | null = null
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
    const normalized = normalizeTaxLatencyItems(items)
    if (normalized.length > 0) {
      clearLocalStorage(reportId)
      return normalized
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
      candidates: [],

      addItem: (item) =>
        set(
          (state) => ({
            items: [...state.items, normalizeTaxLatencyItem(item)].filter(
              (candidate): candidate is TaxLatencyItem => candidate !== null
            ),
            candidates: state.candidates.filter((candidate) => candidate.id !== item.id),
          }),
          false,
          'addItem'
        ),

      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== id) }), false, 'removeItem'),

      updateItem: (id, partial) =>
        set(
          (state) => ({
            items: state.items.map((i) => (i.id === id ? { ...i, ...partial } : i)),
          }),
          false,
          'updateItem'
        ),

      setItems: (items) => set({ items: normalizeTaxLatencyItems(items) }, false, 'setItems'),

      setCandidates: (candidates) => set({ candidates }, false, 'setCandidates'),

      dismissCandidate: (id) =>
        set(
          (state) => ({
            candidates: state.candidates.filter((candidate) => candidate.id !== id),
          }),
          false,
          'dismissCandidate'
        ),

      clear: () => set({ items: [], candidates: [] }, false, 'clear'),

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
        const stored = normalizeTaxLatencyItems(sessionData._taxLatencies)
        if (stored.length > 0) {
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
// Mirrors normalization store: visibilitychange flush, deferred retry when in-flight
// ─────────────────────────────────────────

async function runTaxLatencySessionPersist(reportId: string): Promise<void> {
  if (isSessionPersistInFlight) {
    pendingVisibilityFlushReportId = reportId
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
    if (pendingVisibilityFlushReportId) {
      const next = pendingVisibilityFlushReportId
      pendingVisibilityFlushReportId = null
      void runTaxLatencySessionPersist(next)
    }
  }
}

export function enableTaxLatencyAutoPersist(getReportId: () => string | undefined) {
  lastItemsJson = JSON.stringify(useTaxLatencyStore.getState().items)
  pendingReportId = null

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

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'hidden') return
    const reportId = getReportId()
    if (!reportId) return
    if (sessionPersistTimer) {
      clearTimeout(sessionPersistTimer)
      sessionPersistTimer = null
    }
    const { items } = useTaxLatencyStore.getState()
    const json = JSON.stringify(items)
    if (json === lastItemsJson && !pendingReportId) return
    lastItemsJson = json
    pendingReportId = reportId
    runTaxLatencySessionPersist(reportId)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
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
      await runTaxLatencySessionPersist(reportId)
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
