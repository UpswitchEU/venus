import type { ValuationRequest, ValuationSession } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { createContextLogger } from '../../utils/logger'
import {
  mergeSessionSurfaceForOptionalPrefill,
  sessionEnvelopeHasIdentitySignals,
} from '../../utils/mergeOptionalSessionPrefillFields'
// Read these constants directly from their source to side-step a Vite SSR
// re-export hazard: when SessionSparseBackfill is loaded via the SessionService
// → SessionBackgroundRevalidation chain in vitest, the re-export through
// mergeOptionalSessionPrefillFields resolves to `undefined` and the spread on
// line 93 crashes at module init with "not iterable". Pinning the import to the
// source file avoids the indirection.
import {
  OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
} from '../../utils/optionalSessionPrefillKeys'
import { isLegalFormBusinessTypeValue } from '../naceBusinessTypeService'

const logger = createContextLogger('SessionSparseBackfill')

/** Diagnostics / cache hints — use merged surface so `_businessInfo`-only sessions register as form-bearing */
export function sessionDataIndicatesUsableFormInputs(sessionData: unknown): boolean {
  if (!sessionData || typeof sessionData !== 'object') return false
  if (sessionEnvelopeHasIdentitySignals(sessionData)) return true
  const m = mergeSessionSurfaceForOptionalPrefill(sessionData) as Record<string, unknown>
  if (m.revenue != null || m.ebitda != null) return true
  const cyd = m.current_year_data
  if (cyd && typeof cyd === 'object' && !Array.isArray(cyd)) {
    const o = cyd as Record<string, unknown>
    if (o.revenue != null || o.ebitda != null) return true
  }
  if (Array.isArray(m.historical_years_data) && m.historical_years_data.length > 0) return true
  const yd = m.year_data ?? m.yearData
  return !!(
    yd &&
    typeof yd === 'object' &&
    !Array.isArray(yd) &&
    Object.keys(yd as object).length > 0
  )
}

/**
 * Keys merged from the in-memory session seed when Titan returns a sparse `session_data`
 * payload. Must cover Hermes/integration metadata that lives outside
 * {@link OPTIONAL_SESSION_PREFILL_SCALAR_KEYS} / {@link OPTIONAL_SESSION_STRUCT_SYNC_KEYS}
 * so `backfillSparseSessionFromStoreSeed` does not drop import quality or ledger analysis
 * after integration + NBB/CBSO enrichment.
 *
 * Note: Titan `BootstrapService.persistCbsoEnrichedFinancialsAttempt` persists only
 * filing-year mirrors and historical rows (`current_year_data`, `historical_years_data`,
 * `revenue`, `ebitda`); integration blobs are written by other bootstrap/accounting paths
 * and must remain listed here.
 */
export const BASE_SPARSE_BACKFILL_KEYS = [
  'company_name',
  'country_code',
  'founding_year',
  'number_of_employees',
  'employee_count',
  'kbo_number',
  'vat_number',
  'city',
  'postal_code',
  'legal_form',
  'business_description',
  'nace_code',
  'canonical_nace_code',
  'nace_description',
  'taxonomy',
  'activity_code',
  'activity_label',
  'business_type_id',
  'subIndustry',
  'industry',
  'revenue',
  'ebitda',
  'year_data',
  'current_year_data',
  'historical_years_data',
  'yearlyFinancials',
  'tax_latencies',
  '_taxLatencies',
  '_normalizations',
  'business_context',
  /** Fiscal panel + Hermes bookkeeping — mirrored in bootstrap prefill, not optional scalars list. */
  'filing_year_confirmed',
  /** Accounting-integration payloads (aliases handled in SessionNormalizer). */
  '_import_quality',
  'import_quality',
  '_financial_data_source',
  '_imported_ledger_analysis',
  '_imported_saas_metrics',
  '_imported_saas_provenance',
] as const

const SPARSE_BACKFILL_KEYS = Array.from(
  new Set<string>([
    ...BASE_SPARSE_BACKFILL_KEYS,
    ...OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
    ...OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
    'forecast_years_data',
    'balance_sheet_adjustments',
    'comparables',
    'official_financials',
    'official_variance_analysis',
    'official_verification_badge',
  ])
)

const ZERO_PLACEHOLDER_NUMERIC_KEYS = new Set([
  'revenue',
  'ebitda',
  'recurring_revenue_percentage',
  'government_bond_yield',
  'long_term_gdp_growth',
  'owner_salary_addback',
  'preparer_ev_ebitda_median',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isFiniteNonZero(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0
}

function isZeroPlaceholderNumericKey(key: string): boolean {
  if (ZERO_PLACEHOLDER_NUMERIC_KEYS.has(key)) return true
  return (
    key.startsWith('dcf_') ||
    key.startsWith('nav_') ||
    key.startsWith('saas_') ||
    key.startsWith('rev_')
  )
}

function isPlaceholderCurrentYearRow(value: unknown): boolean {
  const row = asRecord(value)
  if (!row) return true
  const revenue = row.revenue
  const ebitda = row.ebitda
  const hasMeaningfulRevenue = isFiniteNonZero(revenue)
  const hasMeaningfulEbitda = isFiniteNonZero(ebitda)
  return !hasMeaningfulRevenue && !hasMeaningfulEbitda
}

function isPlaceholderYearArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return true
  return value.every((entry) => {
    const row = asRecord(entry)
    if (!row) return true
    return !isFiniteNonZero(row.revenue) && !isFiniteNonZero(row.ebitda)
  })
}

function shouldBackfillSparseValue(
  key: string,
  currentValue: unknown,
  seedValue: unknown
): boolean {
  if (seedValue == null || seedValue === '') return false

  if (currentValue == null || currentValue === '') return true

  if (
    typeof currentValue === 'number' &&
    isZeroPlaceholderNumericKey(key) &&
    typeof seedValue === 'number'
  ) {
    return currentValue === 0 && seedValue !== 0
  }

  if (key === 'current_year_data') {
    return isPlaceholderCurrentYearRow(currentValue) && !isPlaceholderCurrentYearRow(seedValue)
  }

  if (key === 'historical_years_data' || key === 'yearlyFinancials') {
    return isPlaceholderYearArray(currentValue) && !isPlaceholderYearArray(seedValue)
  }

  if (Array.isArray(currentValue)) {
    return currentValue.length === 0
  }

  const currentRecord = asRecord(currentValue)
  const seedRecord = asRecord(seedValue)
  if (currentRecord && seedRecord) {
    if (Object.keys(currentRecord).length === 0 && Object.keys(seedRecord).length > 0) return true

    if (key === 'business_context') {
      const currentLegalForm = currentRecord.legal_form
      const seedLegalForm = seedRecord.legal_form
      const currentKbo = currentRecord.kbo_registration
      const seedKbo = seedRecord.kbo_registration
      return (
        ((!currentLegalForm || currentLegalForm === '') && !!seedLegalForm) ||
        ((!currentKbo || currentKbo === '') && !!seedKbo)
      )
    }
  }

  return false
}

export async function backfillSparseSessionFromStoreSeed(
  reportId: string,
  session: ValuationSession
): Promise<void> {
  const sessionData = (session.sessionData || {}) as Record<string, unknown>
  try {
    const { useSessionStore } = await import('../../store/useSessionStore')
    const seedSession = useSessionStore.getState().session
    if (!seedSession || seedSession.reportId !== reportId || !seedSession.sessionData) return

    const seedData = seedSession.sessionData as Record<string, unknown>
    const merged: Record<string, unknown> = { ...sessionData }
    const mergedKeys: string[] = []

    for (const key of SPARSE_BACKFILL_KEYS) {
      const seedValue = seedData[key]
      if (seedValue === undefined) continue
      if (shouldBackfillSparseValue(key, merged[key], seedValue)) {
        merged[key] = seedValue
        mergedKeys.push(key)
      }
    }

    if (mergedKeys.length > 0) {
      session.sessionData = merged as Partial<ValuationRequest>
      session.partialData = {
        ...(session.partialData || {}),
        ...Object.fromEntries(mergedKeys.map((k) => [k, merged[k]])),
      }
      logger.info('Backfilled sparse session payload from bootstrap seed', {
        reportId: reportId.substring(0, 30),
        mergedKeysCount: mergedKeys.length,
        mergedKeys: mergedKeys.slice(0, 12),
      })
    }
  } catch (error) {
    logger.warn('Sparse session backfill skipped (non-critical)', {
      reportId: reportId.substring(0, 30),
      error: getErrorMessage(error),
    })
  }
}

/**
 * Fetch business card data from Titan API.
 *
 * Business card data should come from bootstrap. This is only called
 * when bootstrap explicitly indicates missing data.
 */
export async function fetchBusinessCardData(
  clientUserId: string
): Promise<Record<string, unknown> | null> {
  try {
    const apiBaseUrl = getApiUrl()
    const response = await fetch(`${apiBaseUrl}/api/v2/business-cards/${clientUserId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })

    if (!response.ok) {
      logger.debug('Business card fetch failed', {
        clientUserId: clientUserId.substring(0, 8) + '...',
        status: response.status,
      })
      return null
    }

    const businessCard = asRecord(await response.json())
    if (!businessCard) return null
    const data: Record<string, unknown> = {}

    if (businessCard.company_name) data.company_name = businessCard.company_name
    if (businessCard.business_type_id && !data.business_type_id) {
      data.business_type_id = businessCard.business_type_id
    }
    if (businessCard.business_type) {
      data.business_type = businessCard.business_type
      if (!data.business_type_id && !isLegalFormBusinessTypeValue(businessCard.business_type)) {
        data.business_type_id = businessCard.business_type
      }
    }
    if (businessCard.industry) data.industry = businessCard.industry
    if (businessCard.location || businessCard.city) {
      data.location = businessCard.location || businessCard.city
      data.city = businessCard.city || businessCard.location
    }
    if (businessCard.country) {
      data.country = businessCard.country
      data.country_code = businessCard.country
    }
    if (businessCard.founded_year) data.founding_year = businessCard.founded_year
    if (businessCard.company_size) data.company_size = businessCard.company_size
    if (businessCard.company_description) {
      data.company_description = businessCard.company_description
      data.business_description = businessCard.company_description
    }
    if (businessCard.kbo_number) data.kbo_number = businessCard.kbo_number
    if (businessCard.vat_number) data.vat_number = businessCard.vat_number
    if (businessCard.postal_code) data.postal_code = businessCard.postal_code
    if (businessCard.legal_form) data.legal_form = businessCard.legal_form
    if (businessCard.nace_code) data.nace_code = businessCard.nace_code
    if (businessCard.nace_description) data.nace_description = businessCard.nace_description

    return Object.keys(data).length > 0 ? data : null
  } catch (error) {
    logger.debug('Business card fetch error (non-critical)', {
      clientUserId: clientUserId.substring(0, 8) + '...',
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export function mergeBusinessCardIntoSession(
  session: ValuationSession,
  businessCardData: Record<string, unknown>,
  clientContext?: unknown
): void {
  const existingSessionData = asRecord(session.sessionData) ?? {}
  session.sessionData = {
    ...existingSessionData,
    ...businessCardData,
    _client_context: clientContext || existingSessionData._client_context,
  } as Partial<ValuationRequest>

  session.partialData = {
    ...(session.partialData || {}),
    ...businessCardData,
  }
}
