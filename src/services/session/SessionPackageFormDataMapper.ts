import {
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../../utils/fiscalYear'
import { normalizeDcfSessionFields } from './SessionDcfFieldNormalizer'

const PACKAGE_CAMEL_TO_SNAKE: Record<string, string> = {
  companyName: 'company_name',
  kboNumber: 'kbo_number',
  vatNumber: 'vat_number',
  businessTypeId: 'business_type_id',
  businessTypeSegments: 'business_type_segments',
  businessTypeMix: 'business_type_mix',
  businessTypeWeights: 'business_type_weights',
  businessDescription: 'business_description',
  subIndustry: 'subIndustry',
  employeeCount: 'number_of_employees',
  numberOfEmployees: 'number_of_employees',
  employees: 'employees',
  foundingYear: 'founding_year',
  filingYearConfirmed: 'filing_year_confirmed',
  countryCode: 'country_code',
  postalCode: 'postal_code',
  netIncome: 'net_income',
  historicalYearsData: 'historical_years_data',
  forecastYearsData: 'forecast_years_data',
  dcfInputMode: 'dcf_input_mode',
  dcfRevenueGrowthPct: 'dcf_revenue_growth_pct',
  dcfEbitdaMarginPct: 'dcf_ebitda_margin_pct',
  dcfCapexPct: 'dcf_capex_pct',
  dcfDaPct: 'dcf_da_pct',
  dcfNwcPct: 'dcf_nwc_pct',
  dcfTaxRatePct: 'dcf_tax_rate_pct',
  dcfWaccPct: 'dcf_wacc_pct',
  dcfTerminalGrowthPct: 'dcf_terminal_growth_pct',
  dcfExitMultiple: 'dcf_exit_multiple',
  dcfRiskFreeRatePct: 'dcf_risk_free_rate_pct',
  dcfEquityRiskPremiumPct: 'dcf_equity_risk_premium_pct',
  dcfBeta: 'dcf_beta',
  dcfCostOfDebtPct: 'dcf_cost_of_debt_pct',
  dcfDebtEquityPct: 'dcf_debt_equity_pct',
  dcfTaxShieldPct: 'dcf_tax_shield_pct',
  dcfDiscountingConvention: 'dcf_discounting_convention',
  dcfTaxShieldProjections: 'dcf_tax_shield_projections',
  dcfTerminalValueMethod: 'dcf_terminal_value_method',
  currentYearData: 'current_year_data',
  naceCode: 'nace_code',
  naceDescription: 'nace_description',
  canonicalNaceCode: 'canonical_nace_code',
  activityCode: 'activity_code',
  activityLabel: 'activity_label',
  businessContext: 'business_context',
  officialFinancials: 'official_financials',
  officialVarianceAnalysis: 'official_variance_analysis',
  officialVerificationBadge: 'official_verification_badge',
  legalForm: 'legal_form',
}

export function mapPackageFormData(raw: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    const snakeKey = PACKAGE_CAMEL_TO_SNAKE[key] ?? key
    if (snakeKey === '_businessInfo' || snakeKey === 'businessInfo') continue
    if (snakeKey.startsWith('_bootstrap')) continue
    const current = mapped[snakeKey]
    if (
      current !== undefined &&
      current !== null &&
      !(typeof current === 'string' && current.trim() === '') &&
      (value === null || (typeof value === 'string' && value.trim() === ''))
    ) {
      continue
    }
    mapped[snakeKey] = value
  }

  const mappedCurrentYearData = mapped.current_year_data as
    | { year?: number; revenue?: number; ebitda?: number }
    | undefined
  if (mappedCurrentYearData && typeof mappedCurrentYearData === 'object') {
    mapped.current_year_data = {
      ...mappedCurrentYearData,
      year: normalizeCurrentYearForFiling(mappedCurrentYearData.year, mapped.filing_year_confirmed),
    }
  }

  if (Array.isArray(mapped.historical_years_data)) {
    mapped.historical_years_data = normalizeHistoricalYearsForFiling(
      mapped.historical_years_data as Array<{
        year: number
        revenue?: number
        ebitda?: number
      }>,
      mapped.filing_year_confirmed
    )
  }

  normalizeDcfSessionFields(mapped)

  return mapped
}
