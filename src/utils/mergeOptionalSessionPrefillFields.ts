/**
 * Copy method-agnostic valuation inputs from Mercury/session JSON into form updates
 * only when the target field is still empty. Shared by multiples, DCF, NAV, Adaptive.
 *
 * Also gap-fills multi-year history and forecast rows when the session/integration
 * payload carries them but bootstrap only hydrated identity — keeps
 * {@link useSessionOptionalMethodPrefill} aligned with {@link useSessionDataPrefill}.
 */

import type { ValuationFormData, YearDataInput } from '../types/valuation'
import {
  isFilingYearConfirmedValue,
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from './fiscalYear'
import type { YearlyFinancialLike } from './yearlyFinancials'
import {
  buildYearlyFinancialsFromCurrentAndHistorical,
  yearlyFinancialsContainsNonPlaceholderData,
} from './yearlyFinancials'

/**
 * Session/bootstrap often ships multi-year figures as a map (`year_data`) rather than
 * `historical_years_data` — align with {@link SessionNormalizer}.
 */
function historicalRowsFromYearDataBlob(
  yearData: unknown
): Array<{ year: number; revenue?: number; ebitda?: number }> | null {
  if (yearData == null || typeof yearData !== 'object' || Array.isArray(yearData)) return null
  const o = yearData as Record<string, { revenue?: number; ebitda?: number } | unknown>
  const years = Object.keys(o)
    .map((k) => Number.parseInt(k, 10))
    .filter((y) => Number.isFinite(y) && y >= 2000 && y <= 2100)
  if (years.length === 0) return null
  return years
    .sort((a, b) => a - b)
    .map((year) => {
      const raw = o[String(year)] ?? o[year]
      const data =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as { revenue?: number; ebitda?: number })
          : {}
      return { year, revenue: data.revenue, ebitda: data.ebitda }
    })
}

/**
 * When Mercury writes placeholder `''` at the top level but the real value lives on the
 * business card blob, `{ ...bi, ...sd }` would keep the empty string. Fill from the card
 * only for blank / nullish placeholders — a non-empty top-level value still wins.
 */
const SESSION_CARD_FALLBACK_STRING_KEYS = [
  'company_name',
  'kbo_number',
  'vat_number',
  'legal_form',
  'city',
  'postal_code',
  'country_code',
  'industry',
  'business_model',
  'nace_code',
  'nace_description',
  'activity_code',
  'activity_label',
  'canonical_nace_code',
  'business_type_id',
  'business_type',
  'subIndustry',
] as const

const SESSION_CARD_FALLBACK_NULLISH_SCALARS = [
  'revenue',
  'ebitda',
  'founding_year',
  'founded_year',
  'number_of_employees',
  'employee_count',
] as const

function isBlankSessionString(value: unknown): boolean {
  return value === '' || (typeof value === 'string' && value.trim() === '')
}

function yearDataLikeEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return true
  return Object.keys(value as object).length === 0
}

function currentYearDataVacant(value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  const y = o.year
  const hasYear = y != null && String(y).trim() !== ''
  const hasFigures =
    (o.revenue != null && Number.isFinite(Number(o.revenue))) ||
    (o.ebitda != null && Number.isFinite(Number(o.ebitda))) ||
    (o.free_cash_flow != null && Number.isFinite(Number(o.free_cash_flow)))
  if (Object.keys(o).length === 0) return true
  return !hasYear && !hasFigures
}

function coalesceCardUnderEmptyTopLevel(
  merged: Record<string, unknown>,
  bi: Record<string, unknown>
): void {
  for (const key of SESSION_CARD_FALLBACK_STRING_KEYS) {
    if (!isBlankSessionString(merged[key])) continue
    const b = bi[key]
    if (b === undefined || b === null) continue
    if (typeof b === 'string' && b.trim() === '') continue
    merged[key] = b
  }

  for (const key of SESSION_CARD_FALLBACK_NULLISH_SCALARS) {
    const v = merged[key]
    if (v !== undefined && v !== null) continue
    const b = bi[key]
    if (b === undefined || b === null) continue
    merged[key] = b
  }

  const mh = merged['historical_years_data']
  const bh = bi['historical_years_data']
  if (Array.isArray(mh) && mh.length === 0 && Array.isArray(bh) && bh.length > 0) {
    merged['historical_years_data'] = bh
  }

  const mf = merged['forecast_years_data']
  const bf = bi['forecast_years_data']
  if (Array.isArray(mf) && mf.length === 0 && Array.isArray(bf) && bf.length > 0) {
    merged['forecast_years_data'] = bf
  }

  for (const yk of ['year_data', 'yearData'] as const) {
    if (!yearDataLikeEmpty(merged[yk])) continue
    const b = bi[yk]
    if (b == null || yearDataLikeEmpty(b)) continue
    merged[yk] = b
  }

  if (
    currentYearDataVacant(merged['current_year_data']) &&
    !currentYearDataVacant(bi['current_year_data'])
  ) {
    merged['current_year_data'] = bi['current_year_data']
  }
}

/**
 * Flatten `_businessInfo` into the session record (top-level wins), then recover values
 * hidden behind empty top-level placeholders (Mercury/Titan client-invite shape).
 *
 * **Single read contract for session → form:** manual saves use a flat `sessionData`
 * shape; integrations add richer figures on the same keys — not a parallel hierarchy.
 */
export function mergeSessionSurfaceForOptionalPrefill(
  sessionData: unknown
): Record<string, unknown> {
  if (!sessionData || typeof sessionData !== 'object' || Array.isArray(sessionData)) {
    return {}
  }
  const sd = sessionData as Record<string, unknown> & {
    _businessInfo?: Record<string, unknown>
  }
  const bi =
    sd._businessInfo && typeof sd._businessInfo === 'object' && !Array.isArray(sd._businessInfo)
      ? (sd._businessInfo as Record<string, unknown>)
      : {}
  const merged: Record<string, unknown> = { ...bi, ...sd }
  coalesceCardUnderEmptyTopLevel(merged, bi)
  return merged
}

function sortedFinancialRowsFingerprint(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  const parts: string[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const y = Number(r.year)
    if (!Number.isFinite(y)) continue
    const forecast = r.is_forecast ?? r.isForecast ?? ''
    parts.push(`${y}:${r.revenue ?? ''}:${r.ebitda ?? ''}:${r.free_cash_flow ?? ''}:${forecast}`)
  }
  parts.sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]))
  return parts.join(';')
}

const OPTIONAL_SCALAR_KEYS = [
  'revenue',
  'ebitda',
  'recurring_revenue_percentage',
  'activity_code',
  'canonical_nace_code',
  'shares_for_sale',
  'net_income',
  'use_dcf',
  'use_multiples',
  'user_configured_dcf',
  'projection_years',
  'dcf_input_mode',
  'government_bond_yield',
  'long_term_gdp_growth',
  'dcf_revenue_growth_pct',
  'dcf_ebitda_margin_pct',
  'dcf_capex_pct',
  'dcf_da_pct',
  'dcf_nwc_pct',
  'dcf_tax_rate_pct',
  'dcf_wacc_pct',
  'dcf_terminal_growth_pct',
  'dcf_exit_multiple',
  'dcf_risk_free_rate_pct',
  'dcf_equity_risk_premium_pct',
  'dcf_beta',
  'dcf_cost_of_debt_pct',
  'dcf_debt_equity_pct',
  'dcf_tax_shield_pct',
  'dcf_terminal_value_method',
  'nav_real_estate_adjustment',
  'nav_inventory_adjustment',
  'nav_hidden_reserves',
  'nav_goodwill_writeoff',
  'nav_receivables_adjustment',
  'nav_other_revaluations',
  'nav_tax_latency_pct',
  'nav_off_balance_items',
  'exclude_real_estate',
  'real_estate_book_value',
  'estimated_market_rent',
  'business_highlights',
  'reason_for_selling',
  'owner_role',
  'owner_hours',
  'delegation_capability',
  'succession_plan',
  'number_of_owners',
  'saas_arr',
  'saas_mrr',
  'saas_arr_growth_pct',
  'saas_churn_pct',
  'saas_customer_churn_pct',
  'saas_nrr_pct',
  'saas_gross_margin_pct',
  'saas_cac',
  'saas_customer_concentration_pct',
  'saas_expansion_revenue_pct',
  'saas_sm_spend',
  'rev_recurring_pct',
  'rev_recurring_amount',
  'rev_top_client_concentration_pct',
  'rev_top_client_amount',
  'rev_contract_backlog',
  'rev_gross_churn_pct',
  'rev_capitalized_rd_amount',
  'owner_salary_addback',
  'preparer_ev_ebitda_median',
  '_internal_dcf_preference',
  '_internal_multiples_preference',
  '_internal_owner_dependency_impact',
] as const

/** Exported for tests and optional-change detection (store subscribe). */
export const OPTIONAL_SESSION_PREFILL_SCALAR_KEYS = OPTIONAL_SCALAR_KEYS

/**
 * Structured fields from business-type / adaptive context (not scalars) — must autosave + fingerprint.
 */
export const OPTIONAL_SESSION_STRUCT_SYNC_KEYS = [
  '_internal_key_metrics',
  '_internal_typical_employee_range',
  '_internal_typical_revenue_range',
] as const

/**
 * Compact stable fingerprint of optional prefill *sources* (session JSON, package blob).
 * Ignores unrelated session keys so referential churn does not false-positive as “changed”.
 */
export function stableOptionalPrefillSourceSignature(record: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of OPTIONAL_SCALAR_KEYS) {
    if (!Object.hasOwn(record, key)) continue
    const incoming = record[key]
    if (incoming === undefined || incoming === null) continue
    if (typeof incoming === 'string' && incoming.trim() === '') continue
    parts.push(`${key}:${String(incoming)}`)
  }
  for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) {
    if (!Object.hasOwn(record, key)) continue
    const incoming = record[key]
    if (incoming === undefined || incoming === null) continue
    parts.push(`${key}:${JSON.stringify(incoming)}`)
  }
  const tl = record['tax_latencies']
  if (Array.isArray(tl) && tl.length > 0) {
    const sig = tl
      .map((x) => {
        const o = x as Record<string, unknown>
        return [
          String(o.type ?? ''),
          String(o.temporary_difference ?? ''),
          String(o.tax_rate ?? ''),
          String(o.description ?? '').slice(0, 40),
        ].join(':')
      })
      .sort()
      .join(';')
    parts.push(`tax_latencies:${tl.length}:${sig}`)
  }
  const bsa = record['balance_sheet_adjustments']
  if (Array.isArray(bsa) && bsa.length > 0) {
    const sig = bsa
      .map((x) => {
        const o = x as Record<string, unknown>
        return [
          String(o.id ?? ''),
          String(o.amount ?? ''),
          String(o.type ?? ''),
          String(o.category ?? ''),
        ].join(':')
      })
      .sort()
      .join(';')
    parts.push(`balance_sheet_adjustments:${bsa.length}:${sig}`)
  }
  const hy = record['historical_years_data']
  if (Array.isArray(hy) && hy.length > 0) {
    const sig = sortedFinancialRowsFingerprint(hy)
    if (sig.length > 0) parts.push(`historical_years_data:${sig}`)
  }
  const yd = record['year_data'] ?? record['yearData']
  if (yd && typeof yd === 'object' && !Array.isArray(yd)) {
    const derived = historicalRowsFromYearDataBlob(yd)
    if (derived?.length) {
      const sig = sortedFinancialRowsFingerprint(derived)
      if (sig.length > 0) parts.push(`year_data:${sig}`)
    }
  }
  const fy = record['forecast_years_data']
  if (Array.isArray(fy) && fy.length > 0) {
    const sig = sortedFinancialRowsFingerprint(fy)
    if (sig.length > 0) parts.push(`forecast_years_data:${sig}`)
  }
  const cyd = record['current_year_data']
  if (cyd && typeof cyd === 'object' && !Array.isArray(cyd)) {
    const c = cyd as Record<string, unknown>
    parts.push(
      `current_year_data:${String(c.year ?? '')}:${c.revenue ?? ''}:${c.ebitda ?? ''}:${c.free_cash_flow ?? ''}`
    )
  }
  if (Object.hasOwn(record, 'filing_year_confirmed')) {
    parts.push(
      `filing_year_confirmed:${isFilingYearConfirmedValue(record['filing_year_confirmed']) ? '1' : '0'}`
    )
  }
  const peo = record['preparer_ev_ebitda_override']
  if (peo && typeof peo === 'object' && !Array.isArray(peo)) {
    const o = peo as Record<string, unknown>
    parts.push(`preparer_ev_ebitda_override:${String(o.reason_key ?? '')}`)
  }
  return parts.join('|')
}

/**
 * Fingerprint of optional valuation fields currently present on the form/store snapshot.
 * Used to coalesce Zustand notifications when only non-optional fields change.
 */
export function stableOptionalFormSliceSignature(formData: unknown): string {
  const fd = formData as Record<string, unknown>
  return stableOptionalPrefillSourceSignature(fd)
}

export function getSessionOptionalPrefillSignature(sessionData: unknown): string {
  return stableOptionalPrefillSourceSignature(mergeSessionSurfaceForOptionalPrefill(sessionData))
}

function isEmptySlot(existing: unknown): boolean {
  if (existing === undefined || existing === null) return true
  if (typeof existing === 'string' && existing.trim() === '') return true
  return false
}

export function mergeOptionalSessionPrefillFields(
  mergedData: Record<string, unknown>,
  /** Zustand store, session JSON, or panel local state — overlapping keys, distinct TS types. */
  formData: unknown
): Partial<ValuationFormData> {
  const out: Partial<ValuationFormData> = {}

  const fd = formData as Record<string, unknown>
  for (const key of OPTIONAL_SCALAR_KEYS) {
    if (!Object.hasOwn(mergedData, key)) continue
    const incoming = mergedData[key]
    if (incoming === undefined || incoming === null) continue
    const existing = fd[key]
    if (!isEmptySlot(existing)) continue
    ;(out as Record<string, unknown>)[key] = incoming
  }

  const existingTl = fd['tax_latencies']
  if (
    Array.isArray(mergedData.tax_latencies) &&
    mergedData.tax_latencies.length > 0 &&
    (!Array.isArray(existingTl) || existingTl.length === 0)
  ) {
    out.tax_latencies = mergedData.tax_latencies as ValuationFormData['tax_latencies']
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

  if (mergedData.preparer_ev_ebitda_override && !fd['preparer_ev_ebitda_override']) {
    out.preparer_ev_ebitda_override = mergedData.preparer_ev_ebitda_override as NonNullable<
      ValuationFormData['preparer_ev_ebitda_override']
    >
  }

  // Prefer session blob filing flag when normalizing new history (same tick as Titan merge).
  const filingForNormalize =
    (mergedData.filing_year_confirmed as ValuationFormData['filing_year_confirmed'] | undefined) ??
    (fd['filing_year_confirmed'] as ValuationFormData['filing_year_confirmed'] | undefined)

  const existingHy = fd['historical_years_data']
  let incomingHistorical: unknown[] | null = Array.isArray(mergedData.historical_years_data)
    ? mergedData.historical_years_data
    : null
  if (
    (!incomingHistorical || incomingHistorical.length === 0) &&
    (!Array.isArray(existingHy) || existingHy.length === 0)
  ) {
    const fromYearData =
      historicalRowsFromYearDataBlob(mergedData.year_data) ??
      historicalRowsFromYearDataBlob(mergedData.yearData)
    if (fromYearData?.length) incomingHistorical = fromYearData
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
      out.historical_years_data = normalized as ValuationFormData['historical_years_data']
    }
  }

  const existingCyd = fd['current_year_data']
  if (
    mergedData.current_year_data &&
    typeof mergedData.current_year_data === 'object' &&
    !Array.isArray(mergedData.current_year_data) &&
    (!existingCyd ||
      (typeof existingCyd === 'object' &&
        (existingCyd as { revenue?: unknown }).revenue == null &&
        (existingCyd as { ebitda?: unknown }).ebitda == null))
  ) {
    const merged: YearDataInput = {
      ...(existingCyd && typeof existingCyd === 'object' ? (existingCyd as object) : {}),
      ...(mergedData.current_year_data as YearDataInput),
    }
    if (merged.year != null) {
      merged.year = normalizeCurrentYearForFiling(merged.year, filingForNormalize)
    }
    out.current_year_data = merged
  }

  const existingForecast = fd['forecast_years_data']
  if (
    Array.isArray(mergedData.forecast_years_data) &&
    mergedData.forecast_years_data.length > 0 &&
    (!Array.isArray(existingForecast) || existingForecast.length === 0)
  ) {
    out.forecast_years_data =
      mergedData.forecast_years_data as ValuationFormData['forecast_years_data']
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

  const fdYearly = fd['yearlyFinancials']
  if (
    !yearlyFinancialsContainsNonPlaceholderData(fdYearly as YearlyFinancialLike[] | undefined) &&
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

  return out
}
