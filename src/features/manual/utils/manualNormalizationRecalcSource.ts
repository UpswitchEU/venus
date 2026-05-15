import type { ValuationFormData } from '@/types/valuation'

export interface BuildManualNormalizationRecalcSourceParams {
  formStoreData: ValuationFormData
  latestFinancialOverrides: Partial<ValuationFormData>
}

/**
 * Builds the form snapshot used for normalization-triggered recalculation.
 * Latest panel financial fields win, while missing canonical year rows fall
 * back to the stored form snapshot.
 */
export function buildManualNormalizationRecalcSource({
  formStoreData,
  latestFinancialOverrides,
}: BuildManualNormalizationRecalcSourceParams): ValuationFormData {
  return {
    ...formStoreData,
    ...latestFinancialOverrides,
    current_year_data:
      latestFinancialOverrides.current_year_data ?? formStoreData.current_year_data,
    historical_years_data:
      latestFinancialOverrides.historical_years_data ?? formStoreData.historical_years_data,
    revenue: latestFinancialOverrides.revenue ?? formStoreData.revenue,
    ebitda: latestFinancialOverrides.ebitda ?? formStoreData.ebitda,
  }
}
