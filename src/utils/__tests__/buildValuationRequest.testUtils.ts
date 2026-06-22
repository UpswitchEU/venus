import type { ValuationFormData } from '../../types/valuation'
import { getCurrentFilingYear } from '../fiscalYear'

export function makeFormData(overrides: Partial<ValuationFormData> = {}): ValuationFormData {
  return {
    company_name: 'Metaalwerken Geuns',
    country_code: 'BE',
    founding_year: 2010,
    industry: 'manufacturing',
    business_model: 'services',
    revenue: 1_000_000,
    ebitda: 100_000,
    current_year_data: {
      year: 2099,
      revenue: 1_000_000,
      ebitda: 100_000,
      total_assets: 500_000,
      total_debt: 100_000,
      cash: 25_000,
    },
    historical_years_data: [{ year: getCurrentFilingYear() - 1, revenue: 900_000, ebitda: 90_000 }],
    recurring_revenue_percentage: 0.5,
    ...overrides,
  } as ValuationFormData
}

export type ValuationRequestExtras = Record<string, unknown>
