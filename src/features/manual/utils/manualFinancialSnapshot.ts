import type { ValuationRequest, YearDataInput } from '@/types/valuation'
import { yearlyFinancialRowHasNonPlaceholderData } from '@/utils/yearlyFinancials'

export interface SubmittedFinancialYear {
  year: string
  revenue: number
  ebitda: number
  capex?: number
  nwc_change?: number
  isForecast?: boolean
}

export interface SubmittedFinancialSnapshot {
  revenue?: number
  ebitda?: number
  yearlyFinancials: SubmittedFinancialYear[]
}

export type SubmittedFinancialSnapshotRequest = Pick<
  ValuationRequest,
  'forecast_years_data' | 'historical_years_data' | 'revenue'
> & {
  current_year_data?: YearDataInput | null
  ebitda?: number
}

function toSnapshotYear(row: YearDataInput, isForecast = false): SubmittedFinancialYear {
  return {
    year: String(row.year),
    revenue: row.revenue,
    ebitda: row.ebitda,
    capex: row.capex,
    nwc_change: row.nwc_change,
    ...(isForecast ? { isForecast: true } : {}),
  }
}

/**
 * Builds the post-submit financial snapshot used by dirty-state detection.
 *
 * Forecast rows are kept even when zero-valued because they represent explicit
 * projection structure. Historical/current zero placeholders are filtered out.
 */
export function buildSubmittedFinancialSnapshot(
  request: SubmittedFinancialSnapshotRequest
): SubmittedFinancialSnapshot {
  const current = request.current_year_data
  const yearlyFinancials = [
    ...(current ? [toSnapshotYear(current)] : []),
    ...(request.historical_years_data ?? []).map((row) => toSnapshotYear(row)),
    ...(request.forecast_years_data ?? []).map((row) => toSnapshotYear(row, true)),
  ]
    .filter((row) => yearlyFinancialRowHasNonPlaceholderData(row))
    .sort((a, b) => Number.parseInt(b.year, 10) - Number.parseInt(a.year, 10))

  return {
    revenue: current?.revenue ?? request.revenue,
    ebitda: current?.ebitda ?? request.ebitda,
    yearlyFinancials,
  }
}
