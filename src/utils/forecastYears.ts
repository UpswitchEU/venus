import { getCurrentFilingYear } from './fiscalYear'

/** Aligned with ValuationIQ `YearData.year` bounds. */
export const MIN_FISCAL_YEAR = 2000
export const MAX_FISCAL_YEAR = 2100

export interface ForecastYearLike {
  year: string
  isForecast?: boolean
}

export interface EmptyForecastYear extends ForecastYearLike {
  revenue: number
  ebitda: number
  isForecast: true
}

export const DEFAULT_DCF_FORECAST_YEAR_COUNT = 5
/** Max forecast rows in manual UI (aligned with engine `forecast_years` practical limits). */
export const MAX_FORECAST_YEAR_COUNT = 5
/** Max historical year cards (same cap as forecast for layout parity). */
export const MAX_HISTORICAL_YEAR_COUNT = 5

export function countForecastYears<T extends ForecastYearLike>(yearlyFinancials: T[]): number {
  return yearlyFinancials.filter((entry) => entry.isForecast).length
}

export function canAppendForecastYear<T extends ForecastYearLike>(yearlyFinancials: T[]): boolean {
  if (countForecastYears(yearlyFinancials) >= MAX_FORECAST_YEAR_COUNT) return false
  const next = getNextForecastYear(yearlyFinancials)
  return next >= MIN_FISCAL_YEAR && next <= MAX_FISCAL_YEAR
}

export function getMaxFinancialYear<T extends ForecastYearLike>(
  yearlyFinancials: T[],
  fallbackYear = getCurrentFilingYear()
): number {
  const years = yearlyFinancials
    .map((entry) => Number(entry.year))
    .filter((year) => Number.isFinite(year))

  return years.length > 0 ? Math.max(...years) : fallbackYear
}

export function getNextForecastYear<T extends ForecastYearLike>(
  yearlyFinancials: T[],
  fallbackYear = getCurrentFilingYear()
): number {
  return getMaxFinancialYear(yearlyFinancials, fallbackYear) + 1
}

export function getNextHistoricalYear<T extends ForecastYearLike>(
  yearlyFinancials: T[],
  fallbackYear = getCurrentFilingYear()
): number {
  const historicalYears = yearlyFinancials
    .filter((entry) => !entry.isForecast)
    .map((entry) => Number(entry.year))
    .filter((year) => Number.isFinite(year))

  return historicalYears.length > 0 ? Math.min(...historicalYears) - 1 : fallbackYear - 1
}

export function countHistoricalYears<T extends ForecastYearLike>(yearlyFinancials: T[]): number {
  return yearlyFinancials.filter((entry) => !entry.isForecast).length
}

/** Older year must stay within API fiscal bounds (e.g. cannot add 1999 when floor is 2000). */
export function canAppendHistoricalYear<T extends ForecastYearLike>(
  yearlyFinancials: T[]
): boolean {
  if (countHistoricalYears(yearlyFinancials) >= MAX_HISTORICAL_YEAR_COUNT) return false
  const next = getNextHistoricalYear(yearlyFinancials)
  return next >= MIN_FISCAL_YEAR && next <= MAX_FISCAL_YEAR
}

export function buildEmptyForecastYears(
  startYear: number,
  count = DEFAULT_DCF_FORECAST_YEAR_COUNT
): EmptyForecastYear[] {
  if (!Number.isFinite(startYear) || count <= 0) return []
  const start = Math.trunc(startYear)
  if (start < MIN_FISCAL_YEAR || start > MAX_FISCAL_YEAR) return []

  const rows: EmptyForecastYear[] = []
  const n = Math.min(count, MAX_FORECAST_YEAR_COUNT)
  for (let i = 0; i < n; i++) {
    const y = start + i
    if (y > MAX_FISCAL_YEAR) break
    rows.push({
      year: String(y),
      revenue: 0,
      ebitda: 0,
      isForecast: true,
    })
  }
  return rows
}

/**
 * Manual “+ forecast year”: respects max forecast count and fiscal year bounds (API/engine).
 */
export function appendManualForecastYear<T extends ForecastYearLike>(
  yearlyFinancials: T[]
):
  | { ok: true; yearlyFinancials: Array<T | EmptyForecastYear> }
  | { ok: false; reason: 'max_forecast_years' | 'year_out_of_range' } {
  if (countForecastYears(yearlyFinancials) >= MAX_FORECAST_YEAR_COUNT) {
    return { ok: false, reason: 'max_forecast_years' }
  }
  const start = getNextForecastYear(yearlyFinancials)
  if (start < MIN_FISCAL_YEAR || start > MAX_FISCAL_YEAR) {
    return { ok: false, reason: 'year_out_of_range' }
  }
  const added = buildEmptyForecastYears(start, 1)
  if (added.length === 0) {
    return { ok: false, reason: 'year_out_of_range' }
  }
  return { ok: true, yearlyFinancials: [...yearlyFinancials, ...added] }
}

export function injectDefaultDcfForecastYears<T extends ForecastYearLike>(
  yearlyFinancials: T[],
  fallbackYear = getCurrentFilingYear()
): Array<T | EmptyForecastYear> {
  if (yearlyFinancials.some((entry) => entry.isForecast)) {
    return yearlyFinancials
  }

  const start = getNextForecastYear(yearlyFinancials, fallbackYear)
  const desired = Math.min(DEFAULT_DCF_FORECAST_YEAR_COUNT, MAX_FORECAST_YEAR_COUNT)
  const forecastBlock = buildEmptyForecastYears(start, desired)
  if (forecastBlock.length === 0) {
    return yearlyFinancials
  }

  return [...yearlyFinancials, ...forecastBlock]
}

/**
 * How many rows DCF auto-injection appended (forecast rows only; equals `after.length - before.length`
 * when `after` is a new array from {@link injectDefaultDcfForecastYears}).
 */
export function dcfInjectionAddedRowCount<T>(before: T[], after: T[]): number {
  if (after === before) return 0
  return after.length - before.length
}

export function removeForecastYears<T extends ForecastYearLike>(yearlyFinancials: T[]): T[] {
  return yearlyFinancials.filter((entry) => !entry.isForecast)
}

export function removeForecastYear<T extends ForecastYearLike>(
  yearlyFinancials: T[],
  year: string
): T[] {
  const key = String(year)
  return yearlyFinancials.filter(
    (entry) => !(entry.isForecast && String(entry.year) === key)
  )
}

/** At least one historical row must remain for the valuation flow. */
export function canRemoveHistoricalYear<T extends ForecastYearLike>(
  yearlyFinancials: T[]
): boolean {
  return countHistoricalYears(yearlyFinancials) > 1
}

/** Drop one non-forecast row by fiscal year string (e.g. "2022"). */
export function removeHistoricalYear<T extends ForecastYearLike>(
  yearlyFinancials: T[],
  year: string
): T[] {
  const key = String(year)
  return yearlyFinancials.filter(
    (entry) => entry.isForecast || String(entry.year) !== key
  )
}
