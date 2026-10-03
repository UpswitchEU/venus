import type { YearlyFinancials } from '@/types/valuation'
import { restoreFinancialYear } from '@/utils/restoredFinancialYear'

export type ManualLiveYearlyFinancial = YearlyFinancials

interface BuildManualLiveYearlyFinancialsParams {
  latestYearlyFinancials?: unknown
  formData: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function buildManualLiveYearlyFinancials({
  latestYearlyFinancials,
  formData,
}: BuildManualLiveYearlyFinancialsParams): ManualLiveYearlyFinancial[] {
  // Live panel rows already carry the reported basis and projection ownership.
  if (Array.isArray(latestYearlyFinancials) && latestYearlyFinancials.length > 0) {
    return latestYearlyFinancials
      .filter((row): row is ManualLiveYearlyFinancial => !!restoreFinancialYear(row))
      .map((row) => ({ ...row, ...restoreFinancialYear(row) }))
      .sort((a, b) => Number(b.year) - Number(a.year))
  }

  const formRecord = asRecord(formData)
  const byYear = new Map<string, ManualLiveYearlyFinancial>()
  const pushUniqueYear = (value: unknown, isForecast = false) => {
    const row = restoreFinancialYear(value, isForecast)
    if (row && !byYear.has(row.year)) byYear.set(row.year, row)
  }

  pushUniqueYear(formRecord?.current_year_data)
  for (const row of Array.isArray(formRecord?.historical_years_data)
    ? formRecord.historical_years_data
    : [])
    pushUniqueYear(row)
  for (const row of Array.isArray(formRecord?.forecast_years_data)
    ? formRecord.forecast_years_data
    : [])
    pushUniqueYear(row, true)

  return [...byYear.values()].sort((a, b) => Number(b.year) - Number(a.year))
}
