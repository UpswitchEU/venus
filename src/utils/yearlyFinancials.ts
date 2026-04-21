import { getCurrentFilingYear } from './fiscalYear'

export interface YearlyFinancialLike {
  year?: string | number | null
  revenue?: number | null
  ebitda?: number | null
  free_cash_flow?: number | null
}

export function hasExplicitNumericValue(value: unknown): boolean {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))
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
 * A year is "complete" when:
 * - Revenue and EBITDA are explicit, finite, and not both zero (classic rows), or
 * - Free cash flow is explicit and finite (FCFF-only rows), excluding the triple-zero placeholder.
 */
export function isCompleteYearlyFinancial<T extends YearlyFinancialLike>(year: T): boolean {
  if (!Boolean(year?.year)) return false

  const revE = hasExplicitNumericValue(year.revenue)
  const ebitE = hasExplicitNumericValue(year.ebitda)
  const fcffE = hasExplicitNumericValue(year.free_cash_flow)

  const revenue = revE ? Number(year.revenue) : NaN
  const ebitda = ebitE ? Number(year.ebitda) : NaN
  const fcff = fcffE ? Number(year.free_cash_flow) : NaN

  const revEbitComplete = revE && ebitE && (revenue !== 0 || ebitda !== 0)
  if (revEbitComplete) return true

  if (fcffE && Number.isFinite(fcff)) {
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
  const rev = Number(row.revenue)
  const ebit = Number(row.ebitda)
  const fcff = Number(row.free_cash_flow)
  const fcffSignal =
    hasExplicitNumericValue(row.free_cash_flow) && Number.isFinite(fcff) && fcff !== 0
  return (
    (Number.isFinite(rev) && rev !== 0) ||
    (Number.isFinite(ebit) && ebit !== 0) ||
    fcffSignal
  )
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
  const revN = Number(row.revenue)
  if (Number.isFinite(revN) && revN !== 0) return true
  // Treat explicit 0 as empty default (seed rows); non-zero EBITDA / FCFF still confirm.
  if (hasExplicitNumericValue(row.ebitda) && Number(row.ebitda) !== 0) return true
  if (hasExplicitNumericValue(row.free_cash_flow) && Number(row.free_cash_flow) !== 0)
    return true

  const numericKeys = [
    'capex',
    'nwc_change',
    'depreciation',
    'tax_expense',
    'cash',
    'total_debt',
    'current_assets',
    'current_liabilities',
    'accounts_receivable',
    'accounts_payable',
    'inventory',
    'short_term_debt',
  ] as const
  for (const k of numericKeys) {
    const v = row[k]
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return true
  }
  return false
}
