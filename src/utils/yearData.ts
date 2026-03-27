import type { YearDataInput } from '../types/valuation'

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
]

export function pickDefinedYearDataFields(
  source: Partial<YearDataInput> | null | undefined
): Partial<YearDataInput> {
  if (!source) {
    return {}
  }

  const result: Partial<YearDataInput> = {}

  for (const field of OPTIONAL_YEAR_DATA_FIELDS) {
    const value = source[field]
    if (typeof value === 'number' && Number.isFinite(value)) {
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
    revenue:
      typeof args.revenue === 'number' && Number.isFinite(args.revenue)
        ? args.revenue
        : typeof current.revenue === 'number' && Number.isFinite(current.revenue)
          ? current.revenue
          : 0,
    ebitda:
      typeof args.ebitda === 'number' && Number.isFinite(args.ebitda)
        ? args.ebitda
        : typeof current.ebitda === 'number' && Number.isFinite(current.ebitda)
          ? current.ebitda
          : 0,
    ...pickDefinedYearDataFields(current),
  }
}

export function mergeYearDataRows(
  rows: Array<{
    year: number | string
    revenue?: number | null
    ebitda?: number | null
    capex?: number | null
    depreciation?: number | null
    nwc_change?: number | null
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
      return {
        year,
        revenue:
          typeof row.revenue === 'number' && Number.isFinite(row.revenue)
            ? row.revenue
            : typeof existing?.revenue === 'number' && Number.isFinite(existing.revenue)
              ? existing.revenue
              : 0,
        ebitda:
          typeof row.ebitda === 'number' && Number.isFinite(row.ebitda)
            ? row.ebitda
            : typeof existing?.ebitda === 'number' && Number.isFinite(existing.ebitda)
              ? existing.ebitda
              : 0,
        ...pickDefinedYearDataFields(existing),
        ...(typeof row.capex === 'number' && Number.isFinite(row.capex) ? { capex: row.capex } : {}),
        ...(typeof row.depreciation === 'number' && Number.isFinite(row.depreciation)
          ? { depreciation: row.depreciation }
          : {}),
        ...(typeof row.nwc_change === 'number' && Number.isFinite(row.nwc_change)
          ? { nwc_change: row.nwc_change }
          : {}),
        ...((row.isForecast || row.is_forecast) && { is_forecast: true }),
      }
    })
    .filter((row): row is YearDataInput => row !== null)
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

  return (currentAssets - cash) - (currentLiabilities - shortTermDebt)
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
