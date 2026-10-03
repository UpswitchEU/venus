import type { ValuationRequest, YearDataInput, YearlyFinancials } from '@/types/valuation'
import { financialYearHasObservations, restoreFinancialYear } from '@/utils/restoredFinancialYear'
import { buildManualLiveYearlyFinancials } from './manualLiveYearlyFinancials'

export type SubmittedFinancialYear = YearlyFinancials

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

/**
 * Builds the post-submit financial snapshot used by dirty-state detection.
 *
 * Forecast rows are kept even when zero-valued because they represent explicit
 * projection structure. Historical/current zero placeholders are filtered out.
 */
export function buildSubmittedFinancialSnapshot(
  request: SubmittedFinancialSnapshotRequest
): SubmittedFinancialSnapshot {
  const current = restoreFinancialYear(request.current_year_data)
  const yearlyFinancials = buildManualLiveYearlyFinancials({ formData: request }).filter(
    financialYearHasObservations
  )

  return {
    revenue: current ? current.revenue : request.revenue,
    ebitda: current ? current.ebitda : request.ebitda,
    yearlyFinancials,
  }
}
