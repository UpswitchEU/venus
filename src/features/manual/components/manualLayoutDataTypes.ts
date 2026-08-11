import type { YearDataInput } from '../../../types/valuation'

export interface CollectedData {
  companyName?: string
  kboNumber?: string
  legalForm?: string
  businessStructure?: string
  address?: string
  city?: string
  postalCode?: string
  naceCode?: string
  naceDescription?: string
  canonicalNaceCode?: string
  businessType?: string
  businessModel?: string
  industry?: string
  country?: string
  yearFounded?: string
  ownerManagers?: number
  fteEmployees?: number
  revenue?: number
  ebitda?: number
  yearlyFinancials?: Array<{
    year: string
    revenue: number
    ebitda: number
    capex?: number
    depreciation?: number
    tax_expense?: number
    cash?: number
    total_debt?: number
    current_assets?: number
    current_liabilities?: number
    accounts_receivable?: number
    accounts_payable?: number
    inventory?: number
    short_term_debt?: number
    nwc_change?: number
    isForecast?: boolean
  }>
  current_year_data?: {
    year: number
    revenue: number
    ebitda: number
    capex?: number
    depreciation?: number
    tax_expense?: number
    cash?: number
    total_debt?: number
    current_assets?: number
    current_liabilities?: number
    accounts_receivable?: number
    accounts_payable?: number
    inventory?: number
    short_term_debt?: number
    nwc_change?: number
  }
  historical_years_data?: YearDataInput[]
  forecast_years_data?: YearDataInput[]
  real_estate_treatment?: 'none' | 'carve_out' | 'included'
  exclude_real_estate?: boolean
  real_estate_market_value?: number
  real_estate_book_value?: number
  estimated_market_rent?: number
  multiple_calibration_adjustment?: number
  multiple_calibration_note?: string
  effective_multiple_override?: number
  effective_multiple_override_note?: string
  multiple_type_weights?: Record<string, number>
  advisor_discount_weights?: Record<string, number>
  risk_analysis_enabled?: boolean
  discount_floor_factor?: number
  historical_ebitda_weighting_mode?: 'standard' | 'weighted'
  historical_ebitda_weights?: Record<number, number>
  show_enterprise_to_equity_bridge?: boolean
  allow_untrusted_multiples_fallback?: boolean
  untrusted_multiples_fallback_reason?: string
  headline_value_basis?: 'equity_value' | 'enterprise_value'
  owner_salary_addback?: number
  owner_role?: 'working' | 'passive'
}
