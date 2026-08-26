/**
 * Tax Latency Store
 *
 * Manages deferred tax assets/liabilities (belastinglatenties) for equity value adjustment.
 * These are NOT EBITDA normalisations — they adjust the equity bridge:
 *   Active latency (vordering)  → adds to equity value
 *   Passive latency (verplichting) → subtracts from equity value
 *
 * Persistence: auto-syncs canonical `tax_latencies` plus the UI-only
 * `_taxLatencies` representation to session JSONB (debounced 300ms).
 *
 * @module store/useTaxLatencyStore
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  getMercurySourceApp,
  getSessionAutosaveDeferRemainingMs,
} from '../hooks/formSessionAutosaveDefer'
import {
  readBrowserRecoveryValue,
  removeBrowserRecoveryValue,
  writeBrowserRecoveryValue,
} from '../utils/browserRecoveryStorage'
import { generalLogger } from '../utils/logger'
import {
  canonicalizeTaxLatencyWireArray,
  canonicalTaxLatenciesToStoreItems,
  TaxLatencyBoundaryError,
} from '../utils/taxLatencyWire'
import { useManualFormStore } from './manual/useManualFormStore'
import { SessionJsonbAutosaveCoordinator } from './sessionJsonbAutosaveCoordinator'
import { useSessionStore } from './useSessionStore'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type TaxLatencyType = 'active' | 'passive'

/**
 * Provenance of the most recent store mutation. Subscribers that drive
 * side effects (e.g. auto-recalculating the valuation) gate on `'user'` —
 * `'system'` covers version restore, session hydration, crash recovery, and
 * the abandon-flow clear, none of which should retrigger a fresh calc.
 *
 * Replaces the previous out-of-band `suppressNextLatencyRecalc()` counter:
 * the source is now part of the state mutation itself, so there is no
 * pre-mount leak window and no chance of a queued skip applying to the
 * wrong mutation.
 */
export type TaxLatencyMutationSource = 'user' | 'system'

export interface TaxLatencyMutationOptions {
  source?: TaxLatencyMutationSource
}

export interface TaxLatencyItem {
  id: string
  type: TaxLatencyType
  accountCode?: string
  accountName?: string
  description: string
  temporaryDifference: number
  taxRate: number
  /** Optional canonical governance; absence means proposed/unpriced. */
  status?: string
  evidence_id?: string
  reviewed_at?: string
  rule_version?: string
  approved_by?: string
  currency?: string
  fiscal_year?: number
  effective_date?: string
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
  status?: string
  evidence_id?: string
  reviewed_at?: string
  rule_version?: string
  approved_by?: string
  currency?: string
  fiscal_year?: number
  effective_date?: string
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function optionalString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function optionalFiscalYear(record: Record<string, unknown>): number | undefined {
  const value = record.fiscal_year ?? record.fiscalYear
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(numeric) && numeric >= 1900 && numeric <= 2100 ? numeric : undefined
}

function normalizeTaxLatencyItem(input: unknown): TaxLatencyItem | null {
  if (!input || typeof input !== 'object') return null

  const record = input as Record<string, unknown>
  const id = typeof record.id === 'string' && record.id ? record.id : ''
  if (!id) return null

  const status = optionalString(record, 'status')
  const evidenceId = optionalString(record, 'evidence_id', 'evidenceId')
  const reviewedAt = optionalString(record, 'reviewed_at', 'reviewedAt')
  const ruleVersion = optionalString(record, 'rule_version', 'ruleVersion')
  const approvedBy = optionalString(record, 'approved_by', 'approvedBy')
  const currency = optionalString(record, 'currency')?.toUpperCase()
  const fiscalYear = optionalFiscalYear(record)
  const effectiveDate = optionalString(record, 'effective_date', 'effectiveDate')

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
    ...(status ? { status } : {}),
    ...(evidenceId ? { evidence_id: evidenceId } : {}),
    ...(reviewedAt ? { reviewed_at: reviewedAt } : {}),
    ...(ruleVersion ? { rule_version: ruleVersion } : {}),
    ...(approvedBy ? { approved_by: approvedBy } : {}),
    ...(currency ? { currency } : {}),
    ...(fiscalYear != null ? { fiscal_year: fiscalYear } : {}),
    ...(effectiveDate ? { effective_date: effectiveDate } : {}),
  }
}

function normalizeTaxLatencyItems(input: unknown): TaxLatencyItem[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => normalizeTaxLatencyItem(item))
    .filter((item): item is TaxLatencyItem => item !== null)
}

function invalidateTaxLatencyApproval(item: TaxLatencyItem): TaxLatencyItem {
  const proposed = { ...item, status: 'proposed' }
  delete proposed.evidence_id
  delete proposed.reviewed_at
  delete proposed.rule_version
  delete proposed.approved_by
  return proposed
}

function getTaxLatencySessionPersistDeferRemainingMs(reportId: string): number {
  const sessionState = useSessionStore.getState()
  return getSessionAutosaveDeferRemainingMs({
    reportId,
    restorationComplete: sessionState.restorationComplete,
    sessionStatus: sessionState.status,
    sourceApp: getMercurySourceApp(),
  })
}

/**
 * Stable key for deduping items / promoted candidates by (accountCode, type).
 * Same MAR row showing up twice (e.g. once as a manual passive entry, once as
 * an auto-promoted candidate) collapses to a single row.
 */
function taxLatencyItemKey(accountCode?: string, type?: string): string {
  return `${String(accountCode ?? '')
    .trim()
    .toLowerCase()}|${String(type ?? '').toLowerCase()}`
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

  /**
   * Provenance of the most recent mutation. Subscribers driving side effects
   * (e.g. the valuation auto-recalc in `ManualLayout`) gate on `'user'`.
   */
  _lastMutationSource: TaxLatencyMutationSource | null
  /**
   * Monotonic counter incremented on every mutation. Lets subscribers detect
   * "a mutation happened" even when the resulting `items` array is reference-
   * or content-equal to the previous one (e.g. a programmatic `clear()` when
   * items were already empty).
   */
  _mutationSeq: number

  addItem: (item: TaxLatencyItem) => void
  removeItem: (id: string) => void
  updateItem: (id: string, partial: Partial<TaxLatencyItem>) => void
  setItems: (items: TaxLatencyItem[], options?: TaxLatencyMutationOptions) => void
  setCandidates: (candidates: TaxLatencyCandidate[], options?: TaxLatencyMutationOptions) => void
  dismissCandidate: (id: string) => void
  clear: (options?: TaxLatencyMutationOptions) => void

  persistToSession: (reportId: string) => Promise<void>
  loadFromSession: (sessionData: Record<string, unknown> | null | undefined) => void

  getNetImpact: () => number
}

// ─────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────

// ─────────────────────────────────────────
// AUTO-RECALC GATING
// Programmatic mutations (version restore, session hydration, abandon-clear) must
// NOT trigger the post-valuation auto-recalculation in ManualLayout — that would
// overwrite the restored/hydrated valuation result with a fresh calc.
//
// Every mutation stamps `state._lastMutationSource`. Subscribers gate on it
// directly. No out-of-band counter, no pre-mount leak window: the source is
// part of the same state update the subscriber observes, so there is no
// timing seam between "mark intent" and "perform mutation."
// ─────────────────────────────────────────

const LS_PENDING_PREFIX = '_taxlat_pending_'

function saveToLocalStorage(reportId: string, items: TaxLatencyItem[]) {
  writeBrowserRecoveryValue(`${LS_PENDING_PREFIX}${reportId}`, items)
}

function clearLocalStorage(reportId: string) {
  removeBrowserRecoveryValue(`${LS_PENDING_PREFIX}${reportId}`)
}

export function recoverPendingTaxLatencies(reportId: string): TaxLatencyItem[] | null {
  if (!reportId || typeof window === 'undefined') return null
  const items = readBrowserRecoveryValue<unknown[]>(
    `${LS_PENDING_PREFIX}${reportId}`,
    (value): value is unknown[] => Array.isArray(value)
  )
  if (!items) return null

  const normalized = canonicalTaxLatenciesToStoreItems(items)
  if (normalized.length > 0) {
    clearLocalStorage(reportId)
    return normalized
  }

  clearLocalStorage(reportId)
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
      _lastMutationSource: null,
      _mutationSeq: 0,

      addItem: (item) =>
        set(
          (state) => ({
            items: [...state.items, normalizeTaxLatencyItem(item)].filter(
              (candidate): candidate is TaxLatencyItem => candidate !== null
            ),
            candidates: state.candidates.filter((candidate) => candidate.id !== item.id),
            _lastMutationSource: 'user',
            _mutationSeq: state._mutationSeq + 1,
          }),
          false,
          'addItem'
        ),

      removeItem: (id) =>
        set(
          (state) => ({
            items: state.items.filter((i) => i.id !== id),
            _lastMutationSource: 'user',
            _mutationSeq: state._mutationSeq + 1,
          }),
          false,
          'removeItem'
        ),

      updateItem: (id, partial) =>
        set(
          (state) => ({
            // Route through normalizeTaxLatencyItem so partial updates from the UI cannot
            // introduce invalid values (negative temporaryDifference, taxRate > 100, NaN,
            // wrong-cased type). Falls back to the existing item if normalization rejects
            // the merged shape (defensive — should never happen for valid id).
            items: state.items.map((i) => {
              if (i.id !== id) return i
              const merged = { ...i, ...partial }
              const normalized = normalizeTaxLatencyItem(merged)
              return normalized ? invalidateTaxLatencyApproval(normalized) : i
            }),
            _lastMutationSource: 'user',
            _mutationSeq: state._mutationSeq + 1,
          }),
          false,
          'updateItem'
        ),

      setItems: (items, options) =>
        set(
          (state) => ({
            items: normalizeTaxLatencyItems(items),
            _lastMutationSource: options?.source ?? 'user',
            _mutationSeq: state._mutationSeq + 1,
          }),
          false,
          'setItems'
        ),

      setCandidates: (candidates, options) =>
        set(
          (state) => {
            // Zero-draft: auto-promote candidates that arrive fully specified
            // (`autoApply === true` AND a positive `temporaryDifference`) into
            // items immediately, instead of parking them in a card the user
            // has to click. The canonical case is BE MAR 168 deferred tax
            // pulled from any synced provider (Yuki / Exact / Silverfin /
            // Octopus) — the on-balance value already IS the latent tax, so
            // there's nothing for the accountant to compute.
            //
            // Candidates without `autoApply` (real-estate needing FMV input,
            // 16x provisions awaiting accountant judgement) stay as cards.
            const itemKeys = new Set(
              state.items.map((item) => taxLatencyItemKey(item.accountCode, item.type))
            )
            const promoted: TaxLatencyItem[] = []
            const remaining: TaxLatencyCandidate[] = []
            const seenPromotedKeys = new Set<string>()

            for (const candidate of candidates) {
              const code = String(candidate.accountCode ?? '').trim()
              const qualifies =
                candidate.autoApply === true &&
                typeof candidate.temporaryDifference === 'number' &&
                Number.isFinite(candidate.temporaryDifference) &&
                candidate.temporaryDifference > 0 &&
                code.length > 0
              if (!qualifies) {
                remaining.push(candidate)
                continue
              }
              const key = taxLatencyItemKey(code, candidate.type)
              // Don't double-apply: skip if an item already exists for this
              // (accountCode, type) pair (manual entry, prior session, or an
              // earlier candidate in this same batch).
              if (itemKeys.has(key) || seenPromotedKeys.has(key)) continue
              seenPromotedKeys.add(key)
              const item = normalizeTaxLatencyItem({
                id: `auto_${candidate.id}`,
                type: candidate.type,
                accountCode: code,
                accountName: candidate.accountName,
                description: candidate.description,
                temporaryDifference: candidate.temporaryDifference,
                taxRate: candidate.taxRate,
                status: candidate.status,
                evidence_id: candidate.evidence_id,
                reviewed_at: candidate.reviewed_at,
                rule_version: candidate.rule_version,
                approved_by: candidate.approved_by,
                currency: candidate.currency,
                fiscal_year: candidate.fiscal_year,
                effective_date: candidate.effective_date,
              })
              if (item) promoted.push(item)
            }

            const baseTag = {
              _lastMutationSource: options?.source ?? ('user' as TaxLatencyMutationSource),
              _mutationSeq: state._mutationSeq + 1,
            }
            if (promoted.length === 0) {
              return { candidates: remaining, ...baseTag }
            }
            return {
              items: [...state.items, ...promoted],
              candidates: remaining,
              ...baseTag,
            }
          },
          false,
          'setCandidates'
        ),

      dismissCandidate: (id) =>
        set(
          (state) => ({
            candidates: state.candidates.filter((candidate) => candidate.id !== id),
            _lastMutationSource: 'user',
            _mutationSeq: state._mutationSeq + 1,
          }),
          false,
          'dismissCandidate'
        ),

      clear: (options) =>
        set(
          (state) => ({
            items: [],
            candidates: [],
            _lastMutationSource: options?.source ?? 'user',
            _mutationSeq: state._mutationSeq + 1,
          }),
          false,
          'clear'
        ),

      persistToSession: async (reportId) => {
        if (!reportId) return
        const deferRemainingMs = getTaxLatencySessionPersistDeferRemainingMs(reportId)
        if (deferRemainingMs > 0) return

        const sessionState = useSessionStore.getState()
        const { session, updateSessionData, saveSession } = sessionState
        if (!session || session.reportId !== reportId) return

        const { items } = get()
        let canonicalTaxLatencies: ReturnType<typeof canonicalizeTaxLatencyWireArray>
        try {
          canonicalTaxLatencies = canonicalizeTaxLatencyWireArray(items)
        } catch (error) {
          const currentErrors = useManualFormStore.getState().validationErrors
          useManualFormStore.getState().setValidationErrors({
            ...currentErrors,
            tax_latencies:
              error instanceof TaxLatencyBoundaryError
                ? error.message
                : 'Stored tax-latency values must be reviewed.',
          })
          generalLogger.warn('[TaxLatencyStore] Blocking invalid tax-latency autosave', {
            reportId: reportId.substring(0, 12),
            code:
              error instanceof TaxLatencyBoundaryError ? error.boundaryCode : 'TAX_LATENCY_UNKNOWN',
            issueCount: error instanceof TaxLatencyBoundaryError ? error.issues.length : 1,
          })
          throw error
        }

        await updateSessionData({
          tax_latencies: canonicalTaxLatencies,
          _taxLatencies: items,
        })
        await saveSession('autosave')
        const currentErrors = useManualFormStore.getState().validationErrors
        if (currentErrors.tax_latencies) {
          const { tax_latencies: _taxLatencyError, ...remainingErrors } = currentErrors
          useManualFormStore.getState().setValidationErrors(remainingErrors)
        }
        generalLogger.debug('[TaxLatencyStore] Persisted canonical session data', {
          reportId: reportId.substring(0, 12),
          count: items.length,
        })
      },

      loadFromSession: (sessionData) => {
        if (!sessionData) return
        const rawTaxLatencies =
          sessionData.tax_latencies ?? sessionData.taxLatencies ?? sessionData._taxLatencies
        if (rawTaxLatencies === undefined || rawTaxLatencies === null) return
        try {
          const stored = canonicalTaxLatenciesToStoreItems(
            rawTaxLatencies,
            sessionData._taxLatencies
          )
          set(
            (state) => ({
              items: stored,
              _lastMutationSource: 'system',
              _mutationSeq: state._mutationSeq + 1,
            }),
            false,
            'loadFromSession'
          )
          generalLogger.debug('[TaxLatencyStore] Loaded from session data', {
            count: stored.length,
          })
          const currentErrors = useManualFormStore.getState().validationErrors
          if (currentErrors.tax_latencies) {
            const { tax_latencies: _taxLatencyError, ...remainingErrors } = currentErrors
            useManualFormStore.getState().setValidationErrors(remainingErrors)
          }
        } catch (error) {
          set(
            (state) => ({
              items: [],
              _lastMutationSource: 'system',
              _mutationSeq: state._mutationSeq + 1,
            }),
            false,
            'loadFromSessionInvalid'
          )
          const currentErrors = useManualFormStore.getState().validationErrors
          useManualFormStore.getState().setValidationErrors({
            ...currentErrors,
            tax_latencies:
              error instanceof TaxLatencyBoundaryError
                ? error.message
                : 'Stored tax-latency values must be reviewed.',
          })
          generalLogger.warn('[TaxLatencyStore] Session tax latencies require review', {
            code:
              error instanceof TaxLatencyBoundaryError ? error.boundaryCode : 'TAX_LATENCY_UNKNOWN',
            issueCount: error instanceof TaxLatencyBoundaryError ? error.issues.length : 1,
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

const taxLatencySessionAutosave = new SessionJsonbAutosaveCoordinator<
  TaxLatencyStore,
  TaxLatencyItem
>({
  storeName: 'TaxLatencyStore',
  getItems: () => useTaxLatencyStore.getState().items,
  selectItems: (state) => state.items,
  subscribe: (listener) => useTaxLatencyStore.subscribe(listener),
  persistToSession: (reportId) => useTaxLatencyStore.getState().persistToSession(reportId),
  saveRecoveryBuffer: saveToLocalStorage,
  clearRecoveryBuffer: clearLocalStorage,
  resetPendingOnEnable: true,
  getDeferRemainingMs: getTaxLatencySessionPersistDeferRemainingMs,
})

export function enableTaxLatencyAutoPersist(getReportId: () => string | undefined) {
  return taxLatencySessionAutosave.enable(getReportId)
}
