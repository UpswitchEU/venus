import type { ManualValuationFormData, ValuationFormData as VenusFormData } from '@/types/valuation'
import { normalizeBusinessTypeId } from '@/utils/businessTypeIdAliases'
import { coerceIso2OrNull } from '@/utils/coerceIso2Country'
import {
  getCurrentFilingYear,
  isFilingYearConfirmedValue,
  normalizeCurrentYearForFiling,
} from '@/utils/fiscalYear'
import { hasUsableOfficialFinancialsContent } from '@/utils/officialFinancialsContent'
import {
  buildCurrentYearData,
  isYearRowForecast,
  mergeYearDataRows,
  sanitizeForecastRowsForDcfInputMode,
} from '@/utils/yearData'
import { getCompleteYearlyFinancialsDesc } from '@/utils/yearlyFinancials'

export interface ManualPanelYearlyFinancial {
  year: string
  revenue: number
  ebitda: number
  capex?: number
  nwc_change?: number
  free_cash_flow?: number
  isForecast?: boolean
  is_forecast?: boolean
}

type ManualFormMapperRaw = Partial<ManualValuationFormData>

/**
 * Maps ManualInputPanel's camelCase/multi-year payload into the Venus store's
 * snake_case/API-oriented shape. The caller supplies the current store snapshot
 * so partial panel updates do not wipe prefilled business model/country values.
 */
export function mapClarityFormToVenusStore(
  raw: Partial<ManualValuationFormData> | Record<string, unknown>,
  storeForm: VenusFormData
): Partial<VenusFormData> {
  const panelRaw = raw as ManualFormMapperRaw
  const data: ManualFormMapperRaw = {
    ...panelRaw,
    business_model: panelRaw.business_model ?? storeForm.business_model,
    businessModel: panelRaw.businessModel ?? panelRaw.business_model ?? storeForm.business_model,
    country:
      (typeof panelRaw.country === 'string' && panelRaw.country.trim()) ||
      (typeof panelRaw.country_code === 'string' && panelRaw.country_code.trim()) ||
      storeForm.country_code?.trim() ||
      '',
  }

  const resolvedBusinessModel =
    (typeof data.businessModel === 'string' && data.businessModel.trim()) ||
    (typeof data.business_model === 'string' && data.business_model.trim()) ||
    ''

  const yearlyFinancials = (data.yearlyFinancials || []) as ManualPanelYearlyFinancial[]
  const historicalRows = yearlyFinancials.filter((yf) => !isYearRowForecast(yf))
  const forecastRows = yearlyFinancials.filter((yf) => isYearRowForecast(yf))
  const dcfInputMode = data.dcf_input_mode ?? storeForm.dcf_input_mode ?? 'ebitda'

  const completeHistorical = getCompleteYearlyFinancialsDesc(historicalRows)
  const current = completeHistorical[0]
  const historical = completeHistorical.slice(1)
  const currentYear = current ? Number.parseInt(String(current.year), 10) : null
  const existingCurrentYearData =
    data.current_year_data && typeof data.current_year_data === 'object'
      ? data.current_year_data
      : undefined
  const existingCurrentForMappedYear =
    existingCurrentYearData && currentYear === Number(existingCurrentYearData.year)
      ? existingCurrentYearData
      : undefined
  const existingHistoricalYears = Array.isArray(data.historical_years_data)
    ? data.historical_years_data
    : []
  const existingForecastYears = Array.isArray(data.forecast_years_data)
    ? data.forecast_years_data
    : []

  const canonicalNace =
    (typeof data.canonicalNaceCode === 'string' && data.canonicalNaceCode.trim()) ||
    (typeof data.naceCode === 'string' && data.naceCode.trim()) ||
    ''
  const businessTypeId = normalizeBusinessTypeId(data.businessType || data.businessTypeCode)
  const displayNace = typeof data.naceCode === 'string' ? data.naceCode.trim() : ''
  const activityPresentation =
    canonicalNace && displayNace && displayNace !== canonicalNace ? displayNace : ''

  const hasKbo = typeof data.kboNumber === 'string' && data.kboNumber.trim() !== ''
  const hasNaceFields =
    (typeof data.naceCode === 'string' && data.naceCode.trim() !== '') ||
    (typeof data.canonicalNaceCode === 'string' && data.canonicalNaceCode.trim() !== '')
  const companySectionActive = hasKbo || hasNaceFields

  return {
    company_name: data.companyName || '',
    country_code: coerceIso2OrNull(data.country) ?? 'BE',
    industry: data.industry || 'services',
    ...(resolvedBusinessModel ? { business_model: resolvedBusinessModel } : {}),
    founding_year: (() => {
      const rawYear = data.yearFounded
      const parsed =
        typeof rawYear === 'number' && Number.isFinite(rawYear)
          ? Math.trunc(rawYear)
          : Number.parseInt(String(rawYear ?? '').trim(), 10)
      if (Number.isFinite(parsed) && parsed >= 1900 && parsed <= 2100) {
        return parsed
      }
      return getCurrentFilingYear() - 5
    })(),
    number_of_owners: data.ownerManagers || 1,
    number_of_employees: data.fteEmployees,
    shares_for_sale: 100,
    business_type: data.businessStructure === 'sole-trader' ? 'sole-trader' : 'company',
    revenue: current?.revenue,
    ebitda: current?.ebitda,
    current_year_data: current
      ? buildCurrentYearData({
          year: currentYear ?? getCurrentFilingYear(),
          revenue: current.revenue,
          ebitda: current.ebitda,
          currentYearData: existingCurrentForMappedYear,
        })
      : existingCurrentYearData
        ? buildCurrentYearData({
            year: normalizeCurrentYearForFiling(
              existingCurrentYearData.year,
              data.filingYearConfirmed
            ),
            revenue: existingCurrentYearData.revenue,
            ebitda: existingCurrentYearData.ebitda,
            currentYearData: existingCurrentYearData,
          })
        : undefined,
    historical_years_data:
      historical.length > 0
        ? mergeYearDataRows(
            historical.map((h) => ({
              year: Number.parseInt(String(h.year), 10),
              revenue: h.revenue,
              ebitda: h.ebitda,
            })),
            existingHistoricalYears
          )
        : currentYear !== null
          ? existingHistoricalYears.filter((y) => Number(y.year) < currentYear)
          : existingHistoricalYears,
    forecast_years_data:
      forecastRows.length > 0
        ? sanitizeForecastRowsForDcfInputMode(
            mergeYearDataRows(
              forecastRows.map((f) => ({
                year: Number.parseInt(String(f.year), 10),
                revenue: f.revenue,
                ebitda: f.ebitda,
                capex: f.capex,
                nwc_change: f.nwc_change,
                free_cash_flow: f.free_cash_flow,
                isForecast: true,
              })),
              existingForecastYears
            ),
            { dcfInputMode }
          )
        : existingForecastYears,
    ...(data.filingYearConfirmed !== undefined && {
      filing_year_confirmed: isFilingYearConfirmedValue(data.filingYearConfirmed),
    }),
    ...(data.dcf_input_mode != null && { dcf_input_mode: data.dcf_input_mode }),
    ...(companySectionActive
      ? {
          kbo_number: data.kboNumber || '',
          legal_form: data.legalForm || '',
          nace_code: canonicalNace || '',
          nace_description: typeof data.naceDescription === 'string' ? data.naceDescription : '',
          activity_code: (activityPresentation || undefined) as VenusFormData['activity_code'],
        }
      : {}),
    ...(businessTypeId && { business_type_id: businessTypeId }),
    ...(data.dcf_revenue_growth_pct != null && {
      dcf_revenue_growth_pct: data.dcf_revenue_growth_pct,
    }),
    ...(data.dcf_ebitda_margin_pct != null && {
      dcf_ebitda_margin_pct: data.dcf_ebitda_margin_pct,
    }),
    ...(data.dcf_capex_pct != null && { dcf_capex_pct: data.dcf_capex_pct }),
    ...(data.dcf_da_pct != null && { dcf_da_pct: data.dcf_da_pct }),
    ...(data.dcf_nwc_pct != null && { dcf_nwc_pct: data.dcf_nwc_pct }),
    ...(data.dcf_tax_rate_pct != null && { dcf_tax_rate_pct: data.dcf_tax_rate_pct }),
    ...(data.dcf_wacc_pct != null && { dcf_wacc_pct: data.dcf_wacc_pct }),
    ...(data.dcf_terminal_growth_pct != null && {
      dcf_terminal_growth_pct: data.dcf_terminal_growth_pct,
    }),
    ...(data.dcf_exit_multiple != null && { dcf_exit_multiple: data.dcf_exit_multiple }),
    ...(data.dcf_risk_free_rate_pct != null && {
      dcf_risk_free_rate_pct: data.dcf_risk_free_rate_pct,
    }),
    ...(data.dcf_equity_risk_premium_pct != null && {
      dcf_equity_risk_premium_pct: data.dcf_equity_risk_premium_pct,
    }),
    ...(data.dcf_beta != null && { dcf_beta: data.dcf_beta }),
    ...(data.dcf_cost_of_debt_pct != null && { dcf_cost_of_debt_pct: data.dcf_cost_of_debt_pct }),
    ...(data.dcf_debt_equity_pct != null && { dcf_debt_equity_pct: data.dcf_debt_equity_pct }),
    ...(data.dcf_tax_shield_pct != null && { dcf_tax_shield_pct: data.dcf_tax_shield_pct }),
    ...(data.dcf_discounting_convention != null && {
      dcf_discounting_convention: data.dcf_discounting_convention,
    }),
    ...(Array.isArray(data.dcf_tax_shield_projections) && {
      dcf_tax_shield_projections: data.dcf_tax_shield_projections,
    }),
    ...(data.dcf_terminal_value_method != null && {
      dcf_terminal_value_method: data.dcf_terminal_value_method,
    }),
    ...(data.nav_real_estate_adjustment != null && {
      nav_real_estate_adjustment: data.nav_real_estate_adjustment,
    }),
    ...(data.exclude_real_estate != null && {
      exclude_real_estate: data.exclude_real_estate,
    }),
    ...(data.real_estate_treatment != null && {
      real_estate_treatment: data.real_estate_treatment,
    }),
    ...(data.real_estate_market_value != null && {
      real_estate_market_value: data.real_estate_market_value,
    }),
    ...(data.real_estate_book_value != null && {
      real_estate_book_value: data.real_estate_book_value,
    }),
    ...(data.estimated_market_rent != null && {
      estimated_market_rent: data.estimated_market_rent,
    }),
    ...(data.multiple_calibration_adjustment != null && {
      multiple_calibration_adjustment: data.multiple_calibration_adjustment,
    }),
    ...(data.multiple_calibration_note != null && {
      multiple_calibration_note: data.multiple_calibration_note,
    }),
    ...(data.effective_multiple_override != null && {
      effective_multiple_override: data.effective_multiple_override,
    }),
    ...(data.effective_multiple_override_note != null && {
      effective_multiple_override_note: data.effective_multiple_override_note,
    }),
    ...(data.multiple_type_weights != null && {
      multiple_type_weights: data.multiple_type_weights,
    }),
    ...(data.advisor_discount_weights != null && {
      advisor_discount_weights: data.advisor_discount_weights,
    }),
    ...(data.risk_analysis_enabled != null && {
      risk_analysis_enabled: data.risk_analysis_enabled,
    }),
    ...(data.discount_floor_factor != null && {
      discount_floor_factor: data.discount_floor_factor,
    }),
    ...(data.historical_ebitda_weighting_mode != null && {
      historical_ebitda_weighting_mode: data.historical_ebitda_weighting_mode,
    }),
    ...(data.historical_ebitda_weights != null && {
      historical_ebitda_weights: data.historical_ebitda_weights,
    }),
    ...(data.show_enterprise_to_equity_bridge != null && {
      show_enterprise_to_equity_bridge: data.show_enterprise_to_equity_bridge,
    }),
    ...(data.nav_inventory_adjustment != null && {
      nav_inventory_adjustment: data.nav_inventory_adjustment,
    }),
    ...(data.nav_hidden_reserves != null && { nav_hidden_reserves: data.nav_hidden_reserves }),
    ...(data.nav_goodwill_writeoff != null && {
      nav_goodwill_writeoff: data.nav_goodwill_writeoff,
    }),
    ...(data.nav_receivables_adjustment != null && {
      nav_receivables_adjustment: data.nav_receivables_adjustment,
    }),
    ...(data.nav_other_revaluations != null && {
      nav_other_revaluations: data.nav_other_revaluations,
    }),
    ...(data.nav_tax_latency_pct != null && {
      nav_tax_latency_pct: data.nav_tax_latency_pct,
    }),
    ...(data.nav_off_balance_items != null && {
      nav_off_balance_items: data.nav_off_balance_items,
    }),
    ...(data.saas_arr != null && { saas_arr: data.saas_arr }),
    ...(data.saas_mrr != null && { saas_mrr: data.saas_mrr }),
    ...(data.saas_arr_growth_pct != null && { saas_arr_growth_pct: data.saas_arr_growth_pct }),
    ...(data.saas_churn_pct != null && { saas_churn_pct: data.saas_churn_pct }),
    ...(data.saas_customer_churn_pct != null && {
      saas_customer_churn_pct: data.saas_customer_churn_pct,
    }),
    ...(data.saas_nrr_pct != null && { saas_nrr_pct: data.saas_nrr_pct }),
    ...(data.saas_gross_margin_pct != null && {
      saas_gross_margin_pct: data.saas_gross_margin_pct,
    }),
    ...(data.saas_cac != null && { saas_cac: data.saas_cac }),
    ...(data.saas_customer_concentration_pct != null && {
      saas_customer_concentration_pct: data.saas_customer_concentration_pct,
    }),
    ...(data.saas_expansion_revenue_pct != null && {
      saas_expansion_revenue_pct: data.saas_expansion_revenue_pct,
    }),
    ...(data.saas_sm_spend != null && { saas_sm_spend: data.saas_sm_spend }),
    ...(data.rev_recurring_pct != null && { rev_recurring_pct: data.rev_recurring_pct }),
    ...(data.rev_recurring_amount != null && { rev_recurring_amount: data.rev_recurring_amount }),
    ...(data.rev_top_client_concentration_pct != null && {
      rev_top_client_concentration_pct: data.rev_top_client_concentration_pct,
    }),
    ...(data.rev_top_client_amount != null && {
      rev_top_client_amount: data.rev_top_client_amount,
    }),
    ...(data.rev_contract_backlog != null && { rev_contract_backlog: data.rev_contract_backlog }),
    ...(data.rev_gross_churn_pct != null && { rev_gross_churn_pct: data.rev_gross_churn_pct }),
    ...(data.owner_salary_addback != null && { owner_salary_addback: data.owner_salary_addback }),
    ...(hasUsableOfficialFinancialsContent(data.official_financials) &&
      data.official_financials && { official_financials: data.official_financials }),
    ...(hasUsableOfficialFinancialsContent(data.official_financials) &&
      data.official_variance_analysis != null && {
        official_variance_analysis: data.official_variance_analysis,
      }),
    ...(hasUsableOfficialFinancialsContent(data.official_financials) &&
      data.official_verification_badge != null && {
        official_verification_badge: data.official_verification_badge,
      }),
  }
}
