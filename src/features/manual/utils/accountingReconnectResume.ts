import type { ClientValuationFinancialSnapshot } from '@/services/api/accounting'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import {
  readBrowserRecoveryValue,
  removeBrowserRecoveryValue,
  writeBrowserRecoveryValue,
} from '@/utils/browserRecoveryStorage'
import { isYearRowForecast } from '@/utils/yearData'
import {
  isAccountingReconnectDraft,
  sanitizeAccountingReconnectDraft,
} from './accountingReconnectDraft'

export const ACCOUNTING_RECONNECT_RESUME_KEY = 'venus_accounting_reconnect_resume'
export const ACCOUNTING_RECONNECT_STATUS_EVENT = 'upswitch:accounting-reconnect-status'

const INTENT_VERSION = 1 as const
const DEFAULT_TTL_MS = 30 * 60 * 1000
const RESYNC_TTL_MS = 10 * 60 * 1000

export type RecoveryPhase =
  | 'reconnect_required'
  | 'oauth_pending'
  | 'handoff_pending'
  | 'resyncing'
  | 'ready'
  | 'failed'

export interface AccountingReconnectIntent {
  version: typeof INTENT_VERSION
  phase: RecoveryPhase
  provider: string
  clientId: string
  reportId: string
  expiresAt: number
  formData: ManualValuationFormData
  oauthNonce?: string
  failure?: string
  firmId?: string
  reasonCode?: string
  lastSuccessfulSyncAt?: string
  unavailableYears?: Array<{ year: number; reason: string }>
  anchorYear?: number | null
}

interface IntentIdentity {
  provider: string
  clientId: string
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function readIntent(storage: Storage, now = Date.now()): AccountingReconnectIntent | null {
  const intent = readBrowserRecoveryValue(
    ACCOUNTING_RECONNECT_RESUME_KEY,
    (value): value is AccountingReconnectIntent => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false
      const record = value as Partial<AccountingReconnectIntent>
      return (
        record.version === INTENT_VERSION &&
        !!clean(record.provider) &&
        typeof record.clientId === 'string' &&
        !!record.clientId.trim() &&
        typeof record.reportId === 'string' &&
        !!record.reportId.trim() &&
        typeof record.expiresAt === 'number' &&
        Number.isFinite(record.expiresAt) &&
        record.expiresAt > now &&
        record.expiresAt <= now + DEFAULT_TTL_MS &&
        ['oauthNonce', 'failure', 'firmId', 'reasonCode', 'lastSuccessfulSyncAt'].every((key) => {
          const field = (record as Record<string, unknown>)[key]
          return field == null || (typeof field === 'string' && field.length <= 500)
        }) &&
        (record.anchorYear == null || Number.isInteger(record.anchorYear)) &&
        (record.unavailableYears == null ||
          (Array.isArray(record.unavailableYears) &&
            record.unavailableYears.length <= 100 &&
            record.unavailableYears.every(
              (row) => row && Number.isInteger(row.year) && typeof row.reason === 'string'
            ))) &&
        isAccountingReconnectDraft(record.formData) &&
        [
          'reconnect_required',
          'oauth_pending',
          'handoff_pending',
          'resyncing',
          'ready',
          'failed',
        ].includes(String(record.phase))
      )
    },
    { storage, nowMs: () => now, ttlMs: DEFAULT_TTL_MS }
  )
  if (!intent) return null
  try {
    return { ...intent, formData: sanitizeAccountingReconnectDraft(intent.formData) }
  } catch {
    removeBrowserRecoveryValue(ACCOUNTING_RECONNECT_RESUME_KEY, { storage })
    return null
  }
}

function sameIdentity(intent: AccountingReconnectIntent, identity: IntentIdentity): boolean {
  return (
    intent.clientId === identity.clientId.trim() &&
    clean(intent.provider) === clean(identity.provider)
  )
}

function writeIntent(storage: Storage, intent: AccountingReconnectIntent, now: number): boolean {
  try {
    return writeBrowserRecoveryValue(
      ACCOUNTING_RECONNECT_RESUME_KEY,
      { ...intent, formData: sanitizeAccountingReconnectDraft(intent.formData) },
      { storage, nowMs: () => now, ttlMs: Math.min(intent.expiresAt - now, DEFAULT_TTL_MS) }
    )
  } catch {
    return false
  }
}

export function persistAccountingReconnectIntent(
  storage: Storage,
  input: {
    provider: string
    clientId: string
    reportId: string
    formData: ManualValuationFormData
    now?: number
    ttlMs?: number
    firmId?: string
    reasonCode?: string
    lastSuccessfulSyncAt?: string
  }
): AccountingReconnectIntent | null {
  const provider = clean(input.provider)
  const clientId = input.clientId.trim()
  const reportId = input.reportId.trim()
  if (!provider || !clientId || !reportId) return null
  const now = input.now ?? Date.now()
  const intent: AccountingReconnectIntent = {
    version: INTENT_VERSION,
    phase: 'reconnect_required',
    provider,
    clientId,
    reportId,
    expiresAt: now + Math.min(input.ttlMs ?? DEFAULT_TTL_MS, DEFAULT_TTL_MS),
    formData: input.formData,
    firmId: input.firmId?.trim() || undefined,
    reasonCode: input.reasonCode?.trim() || undefined,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt?.trim() || undefined,
  }
  return writeIntent(storage, intent, now) ? intent : null
}

export type AccountingReconnectIntentSummary = Pick<
  AccountingReconnectIntent,
  | 'phase'
  | 'provider'
  | 'clientId'
  | 'reportId'
  | 'expiresAt'
  | 'failure'
  | 'firmId'
  | 'reasonCode'
  | 'lastSuccessfulSyncAt'
>

/** Safe UI projection: never exposes the stored valuation draft or OAuth nonce. */
export function readAccountingReconnectIntentSummary(
  storage: Storage,
  now = Date.now()
): AccountingReconnectIntentSummary | null {
  const intent = readIntent(storage, now)
  if (!intent) return null
  const {
    phase,
    provider,
    clientId,
    reportId,
    expiresAt,
    failure,
    firmId,
    reasonCode,
    lastSuccessfulSyncAt,
  } = intent
  return {
    phase,
    provider,
    clientId,
    reportId,
    expiresAt,
    failure,
    firmId,
    reasonCode,
    lastSuccessfulSyncAt,
  }
}

export function bindAccountingReconnectOAuth(
  storage: Storage,
  input: IntentIdentity & { nonce: string; now?: number }
): boolean {
  const now = input.now ?? Date.now()
  const intent = readIntent(storage, now)
  const nonce = input.nonce.trim()
  if (
    !intent ||
    !sameIdentity(intent, input) ||
    !nonce ||
    (intent.phase !== 'reconnect_required' && intent.phase !== 'failed')
  ) {
    return false
  }
  return writeIntent(
    storage,
    {
      ...intent,
      phase: 'oauth_pending',
      oauthNonce: nonce,
      expiresAt: now + DEFAULT_TTL_MS,
      failure: undefined,
    },
    now
  )
}

/**
 * Bind a same-tab Mercury settings handoff to this recovery transaction.
 * Venus sessionStorage remains scoped to the existing top-level browsing
 * context while Mercury handles OAuth, credentials, or an assisted upload.
 */
export function bindAccountingReconnectHandoff(
  storage: Storage,
  input: IntentIdentity & { nonce: string; now?: number }
): boolean {
  const now = input.now ?? Date.now()
  const intent = readIntent(storage, now)
  const nonce = input.nonce.trim()
  if (
    !intent ||
    !sameIdentity(intent, input) ||
    !nonce ||
    (intent.phase !== 'reconnect_required' && intent.phase !== 'failed')
  ) {
    return false
  }
  return writeIntent(
    storage,
    {
      ...intent,
      phase: 'handoff_pending',
      oauthNonce: nonce,
      expiresAt: now + DEFAULT_TTL_MS,
      failure: undefined,
    },
    now
  )
}

/**
 * Claim the post-OAuth resync exactly once. The provider, client and OAuth
 * nonce must all match the calculation that created the recovery intent.
 */
export function beginAccountingReconnectResync(
  storage: Storage,
  input: IntentIdentity & { nonce: string; now?: number }
): AccountingReconnectIntent | null {
  const now = input.now ?? Date.now()
  const intent = readIntent(storage, now)
  if (
    !intent ||
    !sameIdentity(intent, input) ||
    intent.phase !== 'oauth_pending' ||
    !intent.oauthNonce ||
    intent.oauthNonce !== input.nonce.trim()
  ) {
    return null
  }
  const claimed: AccountingReconnectIntent = {
    ...intent,
    phase: 'resyncing',
    expiresAt: now + RESYNC_TTL_MS,
  }
  return writeIntent(storage, claimed, now) ? claimed : null
}

/** Claim a trusted Mercury return exactly once before forcing client resync. */
export function beginAccountingReconnectHandoffResync(
  storage: Storage,
  input: IntentIdentity & { nonce: string; now?: number }
): AccountingReconnectIntent | null {
  const now = input.now ?? Date.now()
  const intent = readIntent(storage, now)
  if (
    !intent ||
    !sameIdentity(intent, input) ||
    intent.phase !== 'handoff_pending' ||
    !intent.oauthNonce ||
    intent.oauthNonce !== input.nonce.trim()
  ) {
    return null
  }
  const claimed: AccountingReconnectIntent = {
    ...intent,
    phase: 'resyncing',
    expiresAt: now + RESYNC_TTL_MS,
  }
  return writeIntent(storage, claimed, now) ? claimed : null
}

/**
 * Reclaim a resync whose page was unloaded after the transaction was claimed.
 * Callers must first own the page-scoped run lock; same-page duplicates must
 * not use this path.
 */
export function resumeInterruptedAccountingReconnectResync(
  storage: Storage,
  input: IntentIdentity & { nonce: string; now?: number }
): AccountingReconnectIntent | null {
  const now = input.now ?? Date.now()
  const intent = readIntent(storage, now)
  if (
    !intent ||
    !sameIdentity(intent, input) ||
    intent.phase !== 'resyncing' ||
    !intent.oauthNonce ||
    intent.oauthNonce !== input.nonce.trim()
  ) {
    return null
  }
  const reclaimed = { ...intent, expiresAt: now + RESYNC_TTL_MS }
  return writeIntent(storage, reclaimed, now) ? reclaimed : null
}

export function markAccountingReconnectReady(
  storage: Storage,
  input: IntentIdentity & {
    formData: ManualValuationFormData
    anchorYear: number | null
    unavailableYears: Array<{ year: number; reason: string }>
    now?: number
  }
): boolean {
  const now = input.now ?? Date.now()
  const intent = readIntent(storage, now)
  if (!intent || !sameIdentity(intent, input) || intent.phase !== 'resyncing') return false
  return writeIntent(
    storage,
    {
      ...intent,
      phase: 'ready',
      formData: input.formData,
      anchorYear: input.anchorYear,
      unavailableYears: input.unavailableYears,
      oauthNonce: undefined,
    },
    now
  )
}

export function markAccountingReconnectFailed(
  storage: Storage,
  input: IntentIdentity & { failure: string; now?: number }
): void {
  const now = input.now ?? Date.now()
  const intent = readIntent(storage, now)
  if (!intent || !sameIdentity(intent, input)) return
  writeIntent(
    storage,
    {
      ...intent,
      phase: 'failed',
      failure: input.failure.slice(0, 500),
      oauthNonce: undefined,
    },
    now
  )
}

/** Consume first, then return: refreshes and duplicate callbacks cannot recalculate twice. */
export function consumeReadyAccountingReconnect(
  storage: Storage,
  input: { clientId: string; reportId: string; now?: number }
): AccountingReconnectIntent | null {
  const intent = readIntent(storage, input.now ?? Date.now())
  if (
    !intent ||
    intent.phase !== 'ready' ||
    intent.clientId !== input.clientId.trim() ||
    intent.reportId !== input.reportId.trim()
  ) {
    return null
  }
  return removeBrowserRecoveryValue(ACCOUNTING_RECONNECT_RESUME_KEY, { storage }) ? intent : null
}

const FINANCIAL_FIELDS = [
  'capex',
  'depreciation',
  'tax_expense',
  'cash',
  'current_assets',
  'current_liabilities',
  'accounts_receivable',
  'accounts_payable',
  'inventory',
  'short_term_debt',
  'total_debt',
  'lease_liabilities',
  'total_equity',
  'total_assets',
  'total_liabilities',
  'nwc_change',
] as const

function toYearlyFinancial(
  row: ClientValuationFinancialSnapshot['years'][number]
): YearlyFinancials | null {
  const year = Number(row.fiscal_year)
  if (
    row.revenue == null ||
    row.ebitda == null ||
    String(row.revenue).trim() === '' ||
    String(row.ebitda).trim() === ''
  )
    return null
  const revenue = Number(row.revenue)
  const ebitda = Number(row.ebitda)
  if (!Number.isInteger(year) || !Number.isFinite(revenue) || !Number.isFinite(ebitda)) return null

  const mapped: YearlyFinancials = {
    year: String(year),
    revenue,
    ebitda,
    source_provider: row.source_provider,
    source_kind: row.source_kind,
    source_synced_at: row.source_synced_at,
    quality_state: row.quality_state as YearlyFinancials['quality_state'],
    correction_id: row.correction_id,
    source_digest: row.source_digest,
    attestation_id: row.attestation_id,
    eligibility_reason: row.eligibility_reason,
    ...(row._source_reconciled === true ? { _source_reconciled: true as const } : {}),
    ...(Array.isArray(row.warning_codes) ? { warning_codes: [...row.warning_codes] } : {}),
  }
  const source = row as Record<string, unknown>
  for (const field of FINANCIAL_FIELDS) {
    const raw = source[field]
    if (raw == null || raw === '') continue
    const value = Number(raw)
    if (Number.isFinite(value)) {
      ;(mapped as unknown as Record<string, unknown>)[field] = value
    }
  }
  return mapped
}

/**
 * Replace every actual row with Titan's authoritative post-resync projection.
 * Forecasts and non-financial answers survive; contaminated or incomplete
 * actual years cannot leak back through legacy store fields.
 */
export function applyValuationSnapshotToReconnectDraft(
  formData: ManualValuationFormData,
  snapshot: ClientValuationFinancialSnapshot
): ManualValuationFormData {
  const forecasts = formData.yearlyFinancials.filter((row) => isYearRowForecast(row))
  const actuals = snapshot.years
    .map((row) => toYearlyFinancial(row))
    .filter((row): row is YearlyFinancials => row !== null)
  const yearlyFinancials = [...actuals, ...forecasts].sort(
    (a, b) => Number(b.year) - Number(a.year)
  )

  return {
    ...formData,
    yearlyFinancials,
    current_year_data: undefined,
    historical_years_data: [],
    revenue: undefined,
    ebitda: undefined,
    filingYearConfirmed: snapshot.anchor_year !== null,
    filing_year_confirmed: snapshot.anchor_year !== null,
  }
}

/**
 * Return the newest actual year that still needs an audited margin review.
 * Reconnect may refresh authorization successfully without making every row
 * calculation-ready; in that case the UI must pause before dispatch, not burn
 * a retry on a validation error the accountant can already resolve in-place.
 */
export function reconnectDraftReviewYear(formData: ManualValuationFormData): number | null {
  const years = formData.yearlyFinancials
    .filter(
      (row) => !isYearRowForecast(row) && row.eligibility_reason === 'extreme_margin_unattested'
    )
    .map((row) => Number(row.year))
    .filter(Number.isInteger)
  return years.length > 0 ? Math.max(...years) : null
}
