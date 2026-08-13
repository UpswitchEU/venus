import type { YearDataInput, YearlyFinancials } from '../types/valuation'
import { getCurrentFilingYear } from './fiscalYear'
import { parseFlexibleNumber } from './isFiniteNumeric'

export interface YearlyFinancialLike {
  year?: string | number | null
  revenue?: unknown
  ebitda?: unknown
  free_cash_flow?: unknown
}

export function hasExplicitNumericValue(value: unknown): boolean {
  return parseFlexibleNumber(value) !== undefined
}

function parseYear(value: string | number | null | undefined): number {
  const year = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(year) ? year : 0
}

export function getHistoricalYearRange(
  baseYear: number = getCurrentFilingYear(),
  count: number = 3,
  startOffset: number = 0
): number[] {
  const safeCount = Math.max(0, count)
  return Array.from({ length: safeCount }, (_, index) => baseYear - startOffset - index)
}

/**
 * Builds manual-panel `yearlyFinancials` from bootstrap/session year rows so
 * normalization tiles match integration prefill when only `historical_years_data`
 * / `current_year_data` were written (defense-in-depth with {@link ManualInputPanel} bridging).
 */
export function buildYearlyFinancialsFromCurrentAndHistorical(
  current: YearDataInput | null | undefined,
  historical: YearDataInput[] | null | undefined
): YearlyFinancials[] {
  const byYear = new Map<number, YearlyFinancials>()
  const upsert = (yearRaw: unknown, revenue: unknown, ebitda: unknown) => {
    const y =
      typeof yearRaw === 'number' && Number.isFinite(yearRaw)
        ? yearRaw
        : Number.parseInt(String(yearRaw ?? ''), 10)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return
    const parsedRevenue = parseFlexibleNumber(revenue)
    const parsedEbitda = parseFlexibleNumber(ebitda)
    byYear.set(y, {
      year: String(y),
      revenue: parsedRevenue ?? 0,
      ebitda: parsedEbitda ?? 0,
    })
  }
  if (current?.year != null) upsert(current.year, current.revenue, current.ebitda)
  if (Array.isArray(historical)) {
    for (const row of historical) {
      if (row?.year != null) upsert(row.year, row.revenue, row.ebitda)
    }
  }
  return [...byYear.values()].sort((a, b) => Number(b.year) - Number(a.year))
}

/**
 * A year is "complete" when:
 * - Revenue and EBITDA are explicit, finite, and not both zero (classic rows), or
 * - Free cash flow is explicit and finite (FCFF-only rows), excluding the triple-zero placeholder.
 */
export function isCompleteYearlyFinancial<T extends YearlyFinancialLike>(year: T): boolean {
  if (!year?.year) return false

  const revE = hasExplicitNumericValue(year.revenue)
  const ebitE = hasExplicitNumericValue(year.ebitda)
  const fcffE = hasExplicitNumericValue(year.free_cash_flow)

  const revenue = revE ? parseFlexibleNumber(year.revenue) : undefined
  const ebitda = ebitE ? parseFlexibleNumber(year.ebitda) : undefined
  const fcff = fcffE ? parseFlexibleNumber(year.free_cash_flow) : undefined

  const revEbitComplete = revE && ebitE && (revenue !== 0 || ebitda !== 0)
  if (revEbitComplete) return true

  if (fcffE && fcff !== undefined) {
    if (revE && ebitE && revenue === 0 && ebitda === 0 && fcff === 0) return false
    if (!revE && !ebitE) return fcff !== 0
    if (revE && ebitE) return true
    return false
  }

  return false
}

/** Row carries real figures (not both zero), or is a forecast row. */
export function yearlyFinancialRowHasNonPlaceholderData(
  row: YearlyFinancialLike & { isForecast?: boolean }
): boolean {
  if (row.isForecast) return true
  const rev = parseFlexibleNumber(row.revenue)
  const ebit = parseFlexibleNumber(row.ebitda)
  const fcff = parseFlexibleNumber(row.free_cash_flow)
  const fcffSignal = fcff !== undefined && fcff !== 0
  return (rev !== undefined && rev !== 0) || (ebit !== undefined && ebit !== 0) || fcffSignal
}

export function yearlyFinancialsContainsNonPlaceholderData(
  yearlyFinancials?: ReadonlyArray<YearlyFinancialLike & { isForecast?: boolean }>
): boolean {
  return (
    Array.isArray(yearlyFinancials) &&
    yearlyFinancials.some((y) => yearlyFinancialRowHasNonPlaceholderData(y))
  )
}

export function getCompleteYearlyFinancialsDesc<T extends YearlyFinancialLike>(years: T[]): T[] {
  return years
    .filter(isCompleteYearlyFinancial)
    .sort((a, b) => parseYear(b.year) - parseYear(a.year))
}

export function getLatestCompleteYearlyFinancial<T extends YearlyFinancialLike>(
  years: T[]
): T | undefined {
  return getCompleteYearlyFinancialsDesc(years)[0]
}

/**
 * Whether removing this historical row should show a confirmation (data / adjustments at risk).
 * `normalizationCountForYear`: normalizations bound to this fiscal year (excluding `applyAllYears`),
 * e.g. from `countNormalizationsBoundToFiscalYear` in `normalizationMath.ts`.
 */
export function historicalYearRowNeedsRemovalWarning(
  row: {
    revenue?: number | null
    ebitda?: number | null
    free_cash_flow?: number | null
    capex?: number | null
    nwc_change?: number | null
    depreciation?: number | null
    tax_expense?: number | null
    cash?: number | null
    total_debt?: number | null
    lease_liabilities?: number | null
    current_assets?: number | null
    current_liabilities?: number | null
    accounts_receivable?: number | null
    accounts_payable?: number | null
    inventory?: number | null
    short_term_debt?: number | null
  },
  normalizationCountForYear: number
): boolean {
  if (normalizationCountForYear > 0) return true
  const revN = parseFlexibleNumber(row.revenue)
  if (revN !== undefined && revN !== 0) return true
  // Treat explicit 0 as empty default (seed rows); non-zero EBITDA / FCFF still confirm.
  if (hasExplicitNumericValue(row.ebitda) && parseFlexibleNumber(row.ebitda) !== 0) return true
  if (hasExplicitNumericValue(row.free_cash_flow) && parseFlexibleNumber(row.free_cash_flow) !== 0)
    return true

  const numericKeys = [
    'capex',
    'nwc_change',
    'depreciation',
    'tax_expense',
    'cash',
    'total_debt',
    'lease_liabilities',
    'current_assets',
    'current_liabilities',
    'accounts_receivable',
    'accounts_payable',
    'inventory',
    'short_term_debt',
  ] as const
  for (const k of numericKeys) {
    const v = row[k]
    const parsed = parseFlexibleNumber(v)
    if (parsed !== undefined && parsed !== 0) return true
  }
  return false
}
