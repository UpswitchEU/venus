import { availableFinancialNumber } from '@/utils/financialObservations'
import { isYearRowForecast } from '@/utils/yearData'
import type { DcfYearlyFinancialsLike } from './dcfSmartDefaults'

export interface DcfHistoricalObservation {
  year: number
  revenue: number
  ebitda: number
}

/** A missing or zero latest base cannot be silently replaced by an older profitable year. */
export function dcfHistoricalBasis(
  rows: DcfYearlyFinancialsLike[] = []
): DcfHistoricalObservation[] {
  const byYear = new Map<number, { revenue: number | undefined; ebitda: number | undefined }>()
  for (const row of rows) {
    if (isYearRowForecast(row)) continue
    const year = Number(row.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return []
    const revenue = availableFinancialNumber(row, 'revenue')
    const ebitda = availableFinancialNumber(row, 'ebitda')
    const prior = byYear.get(year)
    if (prior && (prior.revenue !== revenue || prior.ebitda !== ebitda)) return []
    byYear.set(year, { revenue, ebitda })
  }
  const sorted = [...byYear.entries()].sort(([a], [b]) => a - b)
  const latest = sorted.at(-1)?.[1]
  if (latest?.revenue == null || latest.revenue <= 0 || latest.ebitda == null) return []
  return sorted.flatMap(([year, { revenue, ebitda }]) =>
    revenue != null && revenue > 0 && ebitda != null ? [{ year, revenue, ebitda }] : []
  )
}
