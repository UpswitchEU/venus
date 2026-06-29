import type { YearDataInput } from '../types/valuation'
import { parseFlexibleNumber } from './isFiniteNumeric'

/** True when a year row is marked as forecast (camelCase UI or snake_case API). */
export function isYearRowForecast(
  row:
    | {
        isForecast?: boolean
        is_forecast?: boolean
      }
    | null
    | undefined
): boolean {
  if (!row) return false
  return row.isForecast === true || row.is_forecast === true
}

export const OPTIONAL_YEAR_DATA_FIELDS: Array<keyof YearDataInput> = [
  'cogs',
  'gross_profit',
  'operating_expenses',
  'ebit',
  'capex',
  'depreciation',
  'amortization',
  'interest_expense',
  'tax_expense',
  'net_income',
  'total_assets',
  'current_assets',
  'cash',
  'accounts_receivable',
  'accounts_payable',
  'inventory',
  'total_liabilities',
  'current_liabilities',
  'short_term_debt',
  'total_debt',
  'total_equity',
  'nwc_change',
  'free_cash_flow',
]

export function pickDefinedYearDataFields(
  source: Partial<YearDataInput> | null | undefined
): Partial<YearDataInput> {
  if (!source) {
    return {}
  }

  const result: Partial<YearDataInput> = {}

  for (const field of OPTIONAL_YEAR_DATA_FIELDS) {
    const value = parseFlexibleNumber(source[field])
    if (value !== undefined) {
      ;(result as Record<string, number>)[field] = value
    }
  }

  return result
}

export function buildCurrentYearData(args: {
  year: number
  revenue?: number | null
  ebitda?: number | null
  currentYearData?: Partial<YearDataInput> | null
}): YearDataInput {
  const current = args.currentYearData ?? {}

  return {
    year: args.year,
    revenue: parseFlexibleNumber(args.revenue) ?? parseFlexibleNumber(current.revenue) ?? 0,
    ebitda: parseFlexibleNumber(args.ebitda) ?? parseFlexibleNumber(current.ebitda) ?? 0,
    ...pickDefinedYearDataFields(current),
  }
}

export function mergeYearDataRows(
  rows: Array<{
    year: unknown
    revenue?: unknown
    ebitda?: unknown
    capex?: unknown
    depreciation?: unknown
    nwc_change?: unknown
    free_cash_flow?: unknown
    isForecast?: boolean
    is_forecast?: boolean
  }>,
  existingRows?: Array<Partial<YearDataInput>> | null
): YearDataInput[] {
  const existingByYear = new Map<number, Partial<YearDataInput>>()

  for (const row of existingRows ?? []) {
    if (
      row &&
      typeof row.year === 'number' &&
      Number.isFinite(row.year) &&
      !existingByYear.has(row.year)
    ) {
      existingByYear.set(row.year, row)
    }
  }

  return rows
    .map((row) => {
      const year = Number(row.year)
      if (!Number.isFinite(year)) {
        return null
      }

      const existing = existingByYear.get(year)
      const revenue = parseFlexibleNumber(row.revenue) ?? parseFlexibleNumber(existing?.revenue)
      const ebitda = parseFlexibleNumber(row.ebitda) ?? parseFlexibleNumber(existing?.ebitda)
      const capex = parseFlexibleNumber(row.capex)
      const depreciation = parseFlexibleNumber(row.depreciation)
      const nwcChange = parseFlexibleNumber(row.nwc_change)
      const freeCashFlow = parseFlexibleNumber(row.free_cash_flow)
      return {
        year,
        revenue: revenue ?? 0,
        ebitda: ebitda ?? 0,
        ...pickDefinedYearDataFields(existing),
        ...(capex !== undefined ? { capex } : {}),
        ...(depreciation !== undefined ? { depreciation } : {}),
        ...(nwcChange !== undefined ? { nwc_change: nwcChange } : {}),
        ...(freeCashFlow !== undefined ? { free_cash_flow: freeCashFlow } : {}),
        ...(isYearRowForecast(row) && { is_forecast: true }),
      }
    })
    .filter((row): row is YearDataInput => row !== null)
}

type ForecastYearlyFinancialRow = {
  year: unknown
  revenue?: unknown
  ebitda?: unknown
  capex?: unknown
  depreciation?: unknown
  nwc_change?: unknown
  free_cash_flow?: unknown
  isForecast?: boolean
  is_forecast?: boolean
}

function forecastRowHasMeaningfulFinancials(row: ForecastYearlyFinancialRow): boolean {
  const revenue = parseFlexibleNumber(row.revenue)
  const ebitda = parseFlexibleNumber(row.ebitda)
  if (revenue !== undefined && revenue > 0) return true
  if (ebitda !== undefined && ebitda !== 0) return true

  const explicitFcff = parseFlexibleNumber(row.free_cash_flow)
  if (explicitFcff !== undefined) return true

  return ['capex', 'depreciation', 'nwc_change'].some((field) => {
    const parsed = parseFlexibleNumber(row[field as keyof ForecastYearlyFinancialRow])
    return parsed !== undefined && parsed !== 0
  })
}

export function buildForecastYearDataFromYearlyFinancials(
  yearlyFinancials: unknown
): YearDataInput[] {
  if (!Array.isArray(yearlyFinancials)) return []

  const forecastRows = yearlyFinancials.filter(
    (row): row is ForecastYearlyFinancialRow =>
      row != null &&
      typeof row === 'object' &&
      !Array.isArray(row) &&
      'year' in row &&
      isYearRowForecast(row) &&
      forecastRowHasMeaningfulFinancials(row)
  )

  return mergeYearDataRows(forecastRows)
}

export function yearlyFinancialsContainForecastRows(yearlyFinancials: unknown): boolean {
  return (
    Array.isArray(yearlyFinancials) &&
    yearlyFinancials.some(
      (row) =>
        row != null && typeof row === 'object' && !Array.isArray(row) && isYearRowForecast(row)
    )
  )
}

export function calculateWorkingCapitalBase(
  year: Partial<YearDataInput> | null | undefined
): number | null {
  if (!year) {
    return null
  }

  const ar = year.accounts_receivable
  const inventory = year.inventory
  const ap = year.accounts_payable

  const hasDirectComponents =
    typeof ar === 'number' || typeof inventory === 'number' || typeof ap === 'number'

  if (hasDirectComponents) {
    const receivables = typeof ar === 'number' && Number.isFinite(ar) ? ar : 0
    const stock = typeof inventory === 'number' && Number.isFinite(inventory) ? inventory : 0
    const payables = typeof ap === 'number' && Number.isFinite(ap) ? ap : 0
    return receivables + stock - payables
  }

  const currentAssets =
    typeof year.current_assets === 'number' && Number.isFinite(year.current_assets)
      ? year.current_assets
      : null
  const currentLiabilities =
    typeof year.current_liabilities === 'number' && Number.isFinite(year.current_liabilities)
      ? year.current_liabilities
      : null

  if (currentAssets === null || currentLiabilities === null) {
    return null
  }

  const cash = typeof year.cash === 'number' && Number.isFinite(year.cash) ? year.cash : 0
  const shortTermDebt =
    typeof year.short_term_debt === 'number' && Number.isFinite(year.short_term_debt)
      ? year.short_term_debt
      : 0

  return currentAssets - cash - (currentLiabilities - shortTermDebt)
}

export function deriveNwcChangesForActualYears<T extends YearDataInput>(years: T[]): T[] {
  const sorted = [...years].sort((a, b) => a.year - b.year)

  return sorted.map((year, index) => {
    if (typeof year.nwc_change === 'number' && Number.isFinite(year.nwc_change)) {
      return year
    }

    if (index === 0) {
      return year
    }

    const currentBase = calculateWorkingCapitalBase(year)
    const previousBase = calculateWorkingCapitalBase(sorted[index - 1])
    if (currentBase === null || previousBase === null) {
      return year
    }

    return {
      ...year,
      nwc_change: currentBase - previousBase,
    }
  })
}
