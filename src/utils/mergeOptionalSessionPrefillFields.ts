/**
 * Copy method-agnostic valuation inputs from Mercury/session JSON into form updates
 * only when the target field is still empty. Shared by multiples, DCF, NAV, Adaptive,
 * fiscal (SME rate / deal structure), trust (official_financials / variance / badge),
 * venture (`startup_inputs`, `cap_table`), and Waarderingssynthese (`user_weights`).
 *
 * Also gap-fills multi-year history and forecast rows when the session/integration
 * payload carries them but bootstrap only hydrated identity — keeps
 * {@link useSessionOptionalMethodPrefill} aligned with {@link useSessionDataPrefill}.
 *
 * `business_context`: when the form has identity (KBO) but Hermes has not yet stamped
 * `_imported_*` blobs, merges those keys without overwriting user-facing card fields.
 */
import type {
  OfficialFinancialsPayload,
  ValuationFormData,
  YearDataInput,
} from '../types/valuation'
import { normalizeCurrentYearForFiling, normalizeHistoricalYearsForFiling } from './fiscalYear'
import { hasUsableOfficialFinancialsContent } from './officialFinancialsContent'
import { stripBlockedUntrustedOperatingFinancialSurface } from './officialValuationInputPolicy'
import {
  OPTIONAL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
  SESSION_BUSINESS_CARD_CLEAR_KEYS,
  SESSION_CARD_FALLBACK_NULLISH_SCALARS,
  SESSION_CARD_FALLBACK_STRING_KEYS,
  SKIP_BUSINESS_CONTEXT_SCALAR_PROMOTE,
} from './optionalSessionPrefillKeys'
import { hasConflictingRegistryIdentity } from './registryIdentity'
import {
  historicalRowsFromYearDataBlob,
  mergeSessionSurfaceForOptionalPrefill,
} from './sessionSurfacePrefill'
import { sanitizeForecastRowsForDcfInputMode } from './yearData'
import type { YearlyFinancialLike } from './yearlyFinancials'
import {
  buildYearlyFinancialsFromCurrentAndHistorical,
  yearlyFinancialRowHasNonPlaceholderData,
  yearlyFinancialsContainsNonPlaceholderData,
} from './yearlyFinancials'

export {
  getSessionOptionalPrefillSignature,
  stableOptionalFormSliceSignature,
  stableOptionalPrefillSourceSignature,
} from './optionalPrefillSignature'
export {
  OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
} from './optionalSessionPrefillKeys'
export {
  mergeSessionSurfaceForOptionalPrefill,
  sessionEnvelopeHasIdentitySignals,
} from './sessionSurfacePrefill'

function isEmptySlot(existing: unknown): boolean {
  if (existing === undefined || existing === null) return true
  if (typeof existing === 'string' && existing.trim() === '') return true
  return false
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOptionalZeroPlaceholder(key: string, existing: unknown): boolean {
  if (!isFiniteNumber(existing) || existing !== 0) return false
  if (key === 'shares_for_sale' || key === 'number_of_owners') return false
  if (key === 'revenue' || key === 'ebitda') return true
  if (key.startsWith('dcf_')) return true
  if (key.startsWith('nav_')) return true
  if (key.startsWith('saas_')) return true
  if (key.startsWith('rev_')) return true
  if (key === 'recurring_revenue_percentage') return true
  if (key === 'government_bond_yield') return true
  if (key === 'long_term_gdp_growth') return true
  if (key === 'owner_salary_addback') return true
  if (key === 'preparer_ev_ebitda_median') return true
  return false
}

function isDefaultDcfInputModePlaceholder(
  key: string,
  existing: unknown,
  incoming: unknown
): boolean {
  return key === 'dcf_input_mode' && existing === 'ebitda' && incoming === 'fcff_only'
}

function isEmptyStructSlot(existing: unknown): boolean {
  if (existing == null) return true
  if (Array.isArray(existing)) return existing.length === 0
  if (typeof existing === 'object') return Object.keys(existing as object).length === 0
  return false
}

function isPlaceholderCurrentYearData(existing: unknown): boolean {
  if (existing == null) return true
  if (typeof existing !== 'object' || Array.isArray(existing)) return false
  const row = existing as Record<string, unknown>
  return !yearlyFinancialRowHasNonPlaceholderData({
    year: row.year as string | number | null | undefined,
    revenue: row.revenue as number | null | undefined,
    ebitda: row.ebitda as number | null | undefined,
    free_cash_flow: row.free_cash_flow as number | null | undefined,
  })
}

function latestNonPlaceholderYearRow(
  rows: Array<{ year: number; revenue?: number; ebitda?: number }>
): { year: number; revenue?: number; ebitda?: number } | null {
  return (
    rows
      .filter((row) =>
        yearlyFinancialRowHasNonPlaceholderData({
          year: row.year,
          revenue: row.revenue,
          ebitda: row.ebitda,
        })
      )
      .sort((a, b) => b.year - a.year)[0] ?? null
  )
}

function removeIdentityGapFillFields(out: Partial<ValuationFormData>): Partial<ValuationFormData> {
  const next = { ...out } as Record<string, unknown>
  for (const key of SESSION_BUSINESS_CARD_CLEAR_KEYS) {
    delete next[key]
  }
  return next as Partial<ValuationFormData>
}

export function mergeOptionalSessionPrefillFields(
  rawMergedData: Record<string, unknown>,
  /** Zustand store, session JSON, or panel local state — overlapping keys, distinct TS types. */
  formData: unknown
): Partial<ValuationFormData> {
  const mergedData = stripBlockedUntrustedOperatingFinancialSurface(rawMergedData)
  const out: Partial<ValuationFormData> = {}

  const fd = formData as Record<string, unknown>
  for (const key of OPTIONAL_SCALAR_KEYS) {
    if (!Object.hasOwn(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming === undefined || incoming === null) continue
    const existing = fd[key]
    if (!isEmptySlot(existing)) {
      const canBackfillZeroPlaceholder =
        isOptionalZeroPlaceholder(key, existing) && isFiniteNumber(incoming) && incoming !== 0
      const canBackfillDefaultDcfInputMode = isDefaultDcfInputModePlaceholder(
        key,
        existing,
        incoming
      )
      const canBackfillDefaultSharesForSale =
        key === 'shares_for_sale' &&
        existing === 100 &&
        isFiniteNumber(incoming) &&
        incoming >= 0 &&
        incoming <= 100
      if (
        !canBackfillZeroPlaceholder &&
        !canBackfillDefaultDcfInputMode &&
        !canBackfillDefaultSharesForSale
      )
        continue
    }
    ;(out as Record<string, unknown>)[key] = incoming
  }

  // Registry / `_businessInfo` keys — extractFormData only reads flat session rows.
  for (const key of SESSION_CARD_FALLBACK_STRING_KEYS) {
    if (!Object.hasOwn(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming === undefined || incoming === null) continue
    if (typeof incoming === 'string' && incoming.trim() === '') continue
    const existing = fd[key]
    if (!isEmptySlot(existing)) continue
    ;(out as Record<string, unknown>)[key] = incoming
  }
  for (const key of SESSION_CARD_FALLBACK_NULLISH_SCALARS) {
    if (!Object.hasOwn(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming === undefined || incoming === null) continue
    if (typeof incoming === 'number' && !Number.isFinite(incoming)) continue
    const existing = fd[key]
    if (existing !== undefined && existing !== null) continue
    ;(out as Record<string, unknown>)[key] = incoming
  }

  for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) {
    if (!Object.hasOwn(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming == null) continue
    const existing = fd[key]
    if (!isEmptyStructSlot(existing)) continue
    ;(out as Record<string, unknown>)[key] = incoming
  }

  if (!(out as Record<string, unknown>)['user_weights'] && isEmptyStructSlot(fd['user_weights'])) {
    const uwAlt = mergedData['_user_weights']
    if (
      uwAlt &&
      typeof uwAlt === 'object' &&
      !Array.isArray(uwAlt) &&
      Object.keys(uwAlt as object).length > 0
    ) {
      out.user_weights = uwAlt as ValuationFormData['user_weights']
    }
  }

  const hasScalarValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return false
    if (typeof value === 'string') return value.trim().length > 0
    return true
  }
  const hasStructValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value as object).length > 0
    return true
  }
  const incomingBcForPromote = mergedData['business_context']
  if (
    incomingBcForPromote &&
    typeof incomingBcForPromote === 'object' &&
    !Array.isArray(incomingBcForPromote)
  ) {
    const bc = incomingBcForPromote as Record<string, unknown>
    for (const key of OPTIONAL_SCALAR_KEYS) {
      if (SKIP_BUSINESS_CONTEXT_SCALAR_PROMOTE.has(key)) continue
      if ((out as Record<string, unknown>)[key] !== undefined) continue
      const incoming = bc[key]
      if (!isEmptySlot(fd[key]) && !isDefaultDcfInputModePlaceholder(key, fd[key], incoming)) {
        continue
      }
      if (hasScalarValue(incoming)) {
        ;(out as Record<string, unknown>)[key] = incoming
      }
    }

    for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) {
      if ((out as Record<string, unknown>)[key] !== undefined) continue
      if (!isEmptyStructSlot(fd[key])) continue
      const incoming = bc[key]
      if (hasStructValue(incoming)) {
        ;(out as Record<string, unknown>)[key] = incoming
      }
    }

    const camelToInternal: [string, string][] = [
      ['keyMetrics', '_internal_key_metrics'],
      ['typicalEmployeeRange', '_internal_typical_employee_range'],
      ['typicalRevenueRange', '_internal_typical_revenue_range'],
      ['dcfPreference', '_internal_dcf_preference'],
      ['multiplesPreference', '_internal_multiples_preference'],
      ['ownerDependencyImpact', '_internal_owner_dependency_impact'],
    ]
    for (const [camel, snake] of camelToInternal) {
      if ((out as Record<string, unknown>)[snake] !== undefined) continue
      const cur = fd[snake]
      if (cur !== undefined && cur !== null) continue
      const incoming = bc[camel]
      if (incoming !== undefined && incoming !== null) {
        ;(out as Record<string, unknown>)[snake] = incoming
      }
    }
  }

  // Belgian trust / filing overlays (NBB) — gated so empty UI stubs never block real session data.
  const incomingOfficial = mergedData.official_financials
  if (
    incomingOfficial &&
    typeof incomingOfficial === 'object' &&
    !Array.isArray(incomingOfficial) &&
    !hasUsableOfficialFinancialsContent(
      fd.official_financials as OfficialFinancialsPayload | undefined
    ) &&
    hasUsableOfficialFinancialsContent(incomingOfficial as OfficialFinancialsPayload)
  ) {
    out.official_financials = incomingOfficial as ValuationFormData['official_financials']
    const nestedVa = (incomingOfficial as OfficialFinancialsPayload).varianceAnalysis
    if (
      nestedVa &&
      typeof nestedVa === 'object' &&
      !Array.isArray(nestedVa) &&
      isEmptyStructSlot(fd.official_variance_analysis)
    ) {
      out.official_variance_analysis = nestedVa as ValuationFormData['official_variance_analysis']
    }
  }

  const incomingVaTop = mergedData.official_variance_analysis
  if (
    incomingVaTop &&
    typeof incomingVaTop === 'object' &&
    !Array.isArray(incomingVaTop) &&
    isEmptyStructSlot(fd.official_variance_analysis)
  ) {
    out.official_variance_analysis =
      incomingVaTop as ValuationFormData['official_variance_analysis']
  }

  const incomingVerif = mergedData.official_verification_badge
  if (
    incomingVerif &&
    typeof incomingVerif === 'object' &&
    !Array.isArray(incomingVerif) &&
    isEmptyStructSlot(fd.official_verification_badge)
  ) {
    out.official_verification_badge =
      incomingVerif as ValuationFormData['official_verification_badge']
  }

  const existingTl = fd['tax_latencies'] ?? fd['_taxLatencies']
  const incomingTl =
    (Array.isArray(mergedData.tax_latencies) ? mergedData.tax_latencies : undefined) ??
    (Array.isArray(mergedData.taxLatencies) ? mergedData.taxLatencies : undefined) ??
    (Array.isArray(mergedData._taxLatencies) ? mergedData._taxLatencies : undefined)
  if (
    Array.isArray(incomingTl) &&
    incomingTl.length > 0 &&
    (!Array.isArray(existingTl) || existingTl.length === 0)
  ) {
    out.tax_latencies = incomingTl as ValuationFormData['tax_latencies']
  }

  const existingNormalizations = fd['_normalizations']
  if (
    Array.isArray(mergedData._normalizations) &&
    mergedData._normalizations.length > 0 &&
    (!Array.isArray(existingNormalizations) || existingNormalizations.length === 0)
  ) {
    ;(out as Record<string, unknown>)._normalizations = mergedData._normalizations
  }

  const existingBsa = fd['balance_sheet_adjustments']
  if (
    Array.isArray(mergedData.balance_sheet_adjustments) &&
    mergedData.balance_sheet_adjustments.length > 0 &&
    (!Array.isArray(existingBsa) || existingBsa.length === 0)
  ) {
    out.balance_sheet_adjustments =
      mergedData.balance_sheet_adjustments as ValuationFormData['balance_sheet_adjustments']
  }

  const existingComp = fd['comparables']
  if (
    Array.isArray(mergedData.comparables) &&
    mergedData.comparables.length > 0 &&
    (!Array.isArray(existingComp) || existingComp.length === 0)
  ) {
    out.comparables = mergedData.comparables as ValuationFormData['comparables']
  }

  if (mergedData.preparer_ev_ebitda_override && !fd['preparer_ev_ebitda_override']) {
    out.preparer_ev_ebitda_override = mergedData.preparer_ev_ebitda_override as NonNullable<
      ValuationFormData['preparer_ev_ebitda_override']
    >
  }

  /** Hermes/accounting payloads — merged without clobbering KBO/card fields already on the form. */
  const BC_INTEGRATION_KEYS = [
    '_imported_ledger_analysis',
    '_imported_saas_metrics',
    '_imported_saas_provenance',
    '_imported_ledger_provenance',
    'company_address',
    'company_status',
    'kbo_verified',
  ] as const
  const fdBc = fd['business_context']
  const incomingBc = mergedData['business_context']
  if (incomingBc && typeof incomingBc === 'object' && !Array.isArray(incomingBc)) {
    const inc = incomingBc as Record<string, unknown>
    if (isEmptyStructSlot(fdBc)) {
      out.business_context = incomingBc as ValuationFormData['business_context']
    } else if (fdBc && typeof fdBc === 'object' && !Array.isArray(fdBc)) {
      const cur = fdBc as Record<string, unknown>
      const next = { ...cur }
      let bcTouched = false
      for (const k of BC_INTEGRATION_KEYS) {
        if (inc[k] == null || inc[k] === undefined) continue
        if (!isEmptyStructSlot(cur[k])) continue
        next[k] = inc[k]
        bcTouched = true
      }
      if (bcTouched) {
        out.business_context = next as ValuationFormData['business_context']
      }
    }
  }

  // Prefer session blob filing flag when normalizing new history (same tick as Titan merge).
  const filingForNormalize =
    (mergedData.filing_year_confirmed as ValuationFormData['filing_year_confirmed'] | undefined) ??
    (fd['filing_year_confirmed'] as ValuationFormData['filing_year_confirmed'] | undefined)

  const existingHy = fd['historical_years_data']
  let incomingHistorical: unknown[] | null = Array.isArray(mergedData.historical_years_data)
    ? mergedData.historical_years_data
    : null
  let incomingHistoricalFromYearData = false
  if (
    (!incomingHistorical || incomingHistorical.length === 0) &&
    (!Array.isArray(existingHy) || existingHy.length === 0)
  ) {
    const fromYearData =
      historicalRowsFromYearDataBlob(mergedData.year_data) ??
      historicalRowsFromYearDataBlob(mergedData.yearData)
    if (fromYearData?.length) {
      incomingHistorical = fromYearData
      incomingHistoricalFromYearData = true
    }
  }

  if (
    Array.isArray(incomingHistorical) &&
    incomingHistorical.length > 0 &&
    (!Array.isArray(existingHy) || existingHy.length === 0)
  ) {
    const normalized = normalizeHistoricalYearsForFiling(
      incomingHistorical as Array<{
        year: number
        revenue?: number
        ebitda?: number
      }>,
      filingForNormalize
    )
    if (normalized.length > 0) {
      const yearDataCurrent =
        incomingHistoricalFromYearData && isPlaceholderCurrentYearData(fd['current_year_data'])
          ? latestNonPlaceholderYearRow(normalized)
          : null
      if (yearDataCurrent) {
        out.current_year_data = {
          year: yearDataCurrent.year,
          revenue: yearDataCurrent.revenue ?? 0,
          ebitda: yearDataCurrent.ebitda ?? 0,
        } as YearDataInput
      }
      out.historical_years_data = normalized.filter(
        (row) => row.year !== yearDataCurrent?.year
      ) as ValuationFormData['historical_years_data']
    }
  }

  const existingCyd = fd['current_year_data']
  const incomingCurrentYearData = mergedData.current_year_data
  if (
    incomingCurrentYearData &&
    typeof incomingCurrentYearData === 'object' &&
    !Array.isArray(incomingCurrentYearData)
  ) {
    const incoming = incomingCurrentYearData as Record<string, unknown>
    const next: Record<string, unknown> =
      existingCyd && typeof existingCyd === 'object' && !Array.isArray(existingCyd)
        ? { ...(existingCyd as Record<string, unknown>) }
        : {}
    let changed = !existingCyd
    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined || value === null) continue
      const cur = next[key]
      if (!isEmptySlot(cur)) {
        const canBackfillZeroPlaceholder =
          typeof cur === 'number' &&
          cur === 0 &&
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value !== 0
        if (!canBackfillZeroPlaceholder) continue
      }
      next[key] = value
      changed = true
    }
    if (changed) {
      if (next.year != null) {
        next.year = normalizeCurrentYearForFiling(next.year as number, filingForNormalize)
      }
      out.current_year_data = next as unknown as YearDataInput
    }
  }

  const existingForecast = fd['forecast_years_data']
  if (
    Array.isArray(mergedData.forecast_years_data) &&
    mergedData.forecast_years_data.length > 0 &&
    (!Array.isArray(existingForecast) || existingForecast.length === 0)
  ) {
    const dcfInputMode = mergedData.dcf_input_mode ?? fd['dcf_input_mode'] ?? 'ebitda'
    out.forecast_years_data = sanitizeForecastRowsForDcfInputMode(mergedData.forecast_years_data, {
      dcfInputMode,
    }) as ValuationFormData['forecast_years_data']
  }

  const filingConfirmedExisting = fd['filing_year_confirmed']
  if (
    mergedData.filing_year_confirmed != null &&
    (filingConfirmedExisting === undefined || filingConfirmedExisting === null)
  ) {
    out.filing_year_confirmed =
      mergedData.filing_year_confirmed as ValuationFormData['filing_year_confirmed']
  }

  const sessionCyd = mergedData.current_year_data
  if (sessionCyd && typeof sessionCyd === 'object' && !Array.isArray(sessionCyd)) {
    const c = sessionCyd as Record<string, unknown>
    const rev = c.revenue
    const ebit = c.ebitda
    if (
      isEmptySlot(fd.revenue) &&
      (out as Record<string, unknown>).revenue === undefined &&
      rev != null &&
      Number.isFinite(Number(rev))
    ) {
      out.revenue = Number(rev)
    }
    if (
      isEmptySlot(fd.ebitda) &&
      (out as Record<string, unknown>).ebitda === undefined &&
      ebit != null &&
      Number.isFinite(Number(ebit))
    ) {
      out.ebitda = Number(ebit)
    }
  }

  if (out.current_year_data) {
    const c = out.current_year_data
    if (
      isEmptySlot(fd.revenue) &&
      (out as Record<string, unknown>).revenue === undefined &&
      c.revenue != null &&
      Number.isFinite(Number(c.revenue))
    ) {
      out.revenue = Number(c.revenue)
    }
    if (
      isEmptySlot(fd.ebitda) &&
      (out as Record<string, unknown>).ebitda === undefined &&
      c.ebitda != null &&
      Number.isFinite(Number(c.ebitda))
    ) {
      out.ebitda = Number(c.ebitda)
    }
  }

  const mergedYf = mergedData.yearlyFinancials
  const fdYearlyPrior = fd['yearlyFinancials']
  const formYearlyVacant = !yearlyFinancialsContainsNonPlaceholderData(
    fdYearlyPrior as YearlyFinancialLike[] | undefined
  )
  if (
    Array.isArray(mergedYf) &&
    mergedYf.length > 0 &&
    formYearlyVacant &&
    yearlyFinancialsContainsNonPlaceholderData(mergedYf as YearlyFinancialLike[])
  ) {
    ;(out as Record<string, unknown>).yearlyFinancials = mergedYf
  }

  const effYearlyTail =
    ((out as Record<string, unknown>).yearlyFinancials as YearlyFinancialLike[] | undefined) ??
    (fdYearlyPrior as YearlyFinancialLike[] | undefined)
  if (
    !yearlyFinancialsContainsNonPlaceholderData(effYearlyTail) &&
    (out.historical_years_data || out.current_year_data)
  ) {
    const effCyd = (out.current_year_data ??
      fd['current_year_data']) as ValuationFormData['current_year_data']
    const effHist = (out.historical_years_data ??
      fd['historical_years_data']) as ValuationFormData['historical_years_data']
    const hasHist = Array.isArray(effHist) && effHist.length > 0
    const hasCydYear =
      effCyd && effCyd.year != null && (effCyd.revenue != null || effCyd.ebitda != null || hasHist)
    if (hasHist || hasCydYear) {
      ;(out as Record<string, unknown>).yearlyFinancials =
        buildYearlyFinancialsFromCurrentAndHistorical(effCyd, effHist)
    }
  }

  return hasConflictingRegistryIdentity(fd, mergedData) ? removeIdentityGapFillFields(out) : out
}

/** Shared by SessionRestorationService and {@link queueOptionalGapFillFlush}. */
export function buildOptionalSessionGapFillPatch(
  rawSessionData: unknown,
  formData: unknown
): Partial<ValuationFormData> {
  if (!rawSessionData || typeof rawSessionData !== 'object') return {}
  const merged = mergeSessionSurfaceForOptionalPrefill(rawSessionData)
  const patch = mergeOptionalSessionPrefillFields(merged, formData)
  return hasConflictingRegistryIdentity(formData, merged)
    ? removeIdentityGapFillFields(patch)
    : patch
}
