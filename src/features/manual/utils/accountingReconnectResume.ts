import type { ClientValuationFinancialSnapshot } from '@/services/api/accounting'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { isYearRowForecast } from '@/utils/yearData'

export const ACCOUNTING_RECONNECT_RESUME_KEY = 'venus_accounting_reconnect_resume'

const INTENT_VERSION = 1 as const
const DEFAULT_TTL_MS = 10 * 60 * 1000

type RecoveryPhase =
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

function parseIntent(raw: string | null, now: number): AccountingReconnectIntent | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<AccountingReconnectIntent>
    if (
      value.version !== INTENT_VERSION ||
      !clean(value.provider) ||
      typeof value.clientId !== 'string' ||
      !value.clientId.trim() ||
      typeof value.reportId !== 'string' ||
      !value.reportId.trim() ||
      typeof value.expiresAt !== 'number' ||
      value.expiresAt < now ||
      !value.formData ||
      typeof value.formData !== 'object' ||
      ![
        'reconnect_required',
        'oauth_pending',
        'handoff_pending',
        'resyncing',
        'ready',
        'failed',
      ].includes(
        String(value.phase)
      )
    ) {
      return null
    }
    return value as AccountingReconnectIntent
  } catch {
    return null
  }
}

function readIntent(storage: Storage, now = Date.now()): AccountingReconnectIntent | null {
  const intent = parseIntent(storage.getItem(ACCOUNTING_RECONNECT_RESUME_KEY), now)
  if (!intent) storage.removeItem(ACCOUNTING_RECONNECT_RESUME_KEY)
  return intent
}

function sameIdentity(intent: AccountingReconnectIntent, identity: IntentIdentity): boolean {
  return (
    intent.clientId === identity.clientId.trim() &&
    clean(intent.provider) === clean(identity.provider)
  )
}

function writeIntent(storage: Storage, intent: AccountingReconnectIntent): void {
  storage.setItem(ACCOUNTING_RECONNECT_RESUME_KEY, JSON.stringify(intent))
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
    expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
    formData: input.formData,
  }
  writeIntent(storage, intent)
  return intent
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
  writeIntent(storage, {
    ...intent,
    phase: 'oauth_pending',
    oauthNonce: nonce,
  })
  return true
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
  writeIntent(storage, {
    ...intent,
    phase: 'handoff_pending',
    oauthNonce: nonce,
    failure: undefined,
  })
  return true
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
  const claimed: AccountingReconnectIntent = { ...intent, phase: 'resyncing' }
  writeIntent(storage, claimed)
  return claimed
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
  const claimed: AccountingReconnectIntent = { ...intent, phase: 'resyncing' }
  writeIntent(storage, claimed)
  return claimed
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
  writeIntent(storage, {
    ...intent,
    phase: 'ready',
    formData: input.formData,
    anchorYear: input.anchorYear,
    unavailableYears: input.unavailableYears,
    oauthNonce: undefined,
  })
  return true
}

export function markAccountingReconnectFailed(
  storage: Storage,
  input: IntentIdentity & { failure: string; now?: number }
): void {
  const intent = readIntent(storage, input.now ?? Date.now())
  if (!intent || !sameIdentity(intent, input)) return
  writeIntent(storage, {
    ...intent,
    phase: 'failed',
    failure: input.failure.slice(0, 500),
    oauthNonce: undefined,
  })
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
  storage.removeItem(ACCOUNTING_RECONNECT_RESUME_KEY)
  return intent
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
    source_digest: row.source_digest,
    attestation_id: row.attestation_id,
    eligibility_reason: row.eligibility_reason,
  }
  const source = row as Record<string, unknown>
  for (const field of FINANCIAL_FIELDS) {
    const value = Number(source[field])
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
