import type { ValuationFormData, ValuationRequest } from '../types/valuation'

interface BuildValuationBusinessContextOptions {
  formData: ValuationFormData
  latestRevenue: number | undefined
  countryCode: string
  rawForecastData: NonNullable<ValuationFormData['historical_years_data']>
}

export function buildValuationBusinessContext({
  formData,
  latestRevenue,
  countryCode,
  rawForecastData,
}: BuildValuationBusinessContextOptions): {
  businessContext: ValuationRequest['business_context']
  userConfiguredDcf: boolean
} {
  const fd = formData as ValuationFormData & Record<string, unknown>
  const adaptiveFields: Record<string, unknown> = {}

  if (fd.dcf_revenue_growth_pct != null)
    adaptiveFields.dcf_revenue_growth_pct = fd.dcf_revenue_growth_pct
  if (fd.dcf_ebitda_margin_pct != null)
    adaptiveFields.dcf_ebitda_margin_pct = fd.dcf_ebitda_margin_pct
  if (fd.dcf_capex_pct != null) adaptiveFields.dcf_capex_pct = fd.dcf_capex_pct
  if (fd.dcf_da_pct != null) adaptiveFields.dcf_da_pct = fd.dcf_da_pct
  if (fd.dcf_nwc_pct != null) adaptiveFields.dcf_nwc_pct = fd.dcf_nwc_pct
  if (fd.dcf_tax_rate_pct != null) adaptiveFields.dcf_tax_rate_pct = fd.dcf_tax_rate_pct
  if (fd.dcf_wacc_pct != null) adaptiveFields.dcf_wacc_pct = fd.dcf_wacc_pct
  if (fd.dcf_terminal_growth_pct != null)
    adaptiveFields.dcf_terminal_growth_pct = fd.dcf_terminal_growth_pct
  if (fd.dcf_exit_multiple != null) adaptiveFields.dcf_exit_multiple = fd.dcf_exit_multiple
  if (fd.dcf_risk_free_rate_pct != null)
    adaptiveFields.dcf_risk_free_rate_pct = fd.dcf_risk_free_rate_pct
  if (fd.dcf_equity_risk_premium_pct != null) {
    adaptiveFields.dcf_equity_risk_premium_pct = fd.dcf_equity_risk_premium_pct
  }
  if (fd.dcf_beta != null) adaptiveFields.dcf_beta = fd.dcf_beta
  if (fd.dcf_cost_of_debt_pct != null) adaptiveFields.dcf_cost_of_debt_pct = fd.dcf_cost_of_debt_pct
  if (fd.dcf_debt_equity_pct != null) adaptiveFields.dcf_debt_equity_pct = fd.dcf_debt_equity_pct
  if (fd.dcf_tax_shield_pct != null) adaptiveFields.dcf_tax_shield_pct = fd.dcf_tax_shield_pct
  if (
    fd.dcf_discounting_convention === 'mid_year' ||
    fd.dcf_discounting_convention === 'year_end'
  ) {
    adaptiveFields.dcf_discounting_convention = fd.dcf_discounting_convention
  }
  const dcfTaxShieldProjections = Array.isArray(fd.dcf_tax_shield_projections)
    ? fd.dcf_tax_shield_projections
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    : []
  if (dcfTaxShieldProjections.length > 0) {
    adaptiveFields.dcf_tax_shield_projections = dcfTaxShieldProjections
  }

  const userConfiguredDcf =
    fd.dcf_wacc_pct != null ||
    fd.dcf_terminal_growth_pct != null ||
    fd.dcf_exit_multiple != null ||
    fd.dcf_revenue_growth_pct != null ||
    fd.dcf_ebitda_margin_pct != null ||
    fd.dcf_discounting_convention != null ||
    dcfTaxShieldProjections.length > 0 ||
    (Array.isArray(formData.forecast_years_data) && formData.forecast_years_data.length > 0) ||
    (Array.isArray(rawForecastData) && rawForecastData.length > 0)

  if (
    fd.nav_real_estate_adjustment != null &&
    Number.isFinite(Number(fd.nav_real_estate_adjustment))
  )
    adaptiveFields.nav_real_estate_adjustment = Number(fd.nav_real_estate_adjustment)
  if (fd.nav_inventory_adjustment != null && Number.isFinite(Number(fd.nav_inventory_adjustment)))
    adaptiveFields.nav_inventory_adjustment = Number(fd.nav_inventory_adjustment)
  if (fd.nav_hidden_reserves != null && Number.isFinite(Number(fd.nav_hidden_reserves)))
    adaptiveFields.nav_hidden_reserves = Number(fd.nav_hidden_reserves)
  if (fd.nav_goodwill_writeoff != null && Number.isFinite(Number(fd.nav_goodwill_writeoff)))
    adaptiveFields.nav_goodwill_writeoff = Number(fd.nav_goodwill_writeoff)
  if (
    fd.nav_receivables_adjustment != null &&
    Number.isFinite(Number(fd.nav_receivables_adjustment))
  )
    adaptiveFields.nav_receivables_adjustment = Number(fd.nav_receivables_adjustment)
  if (fd.nav_other_revaluations != null && Number.isFinite(Number(fd.nav_other_revaluations)))
    adaptiveFields.nav_other_revaluations = Number(fd.nav_other_revaluations)
  if (fd.nav_tax_latency_pct != null && Number.isFinite(Number(fd.nav_tax_latency_pct))) {
    adaptiveFields.nav_tax_latency_pct = Math.min(Math.max(Number(fd.nav_tax_latency_pct), 0), 100)
  } else if (countryCode === 'BE') {
    adaptiveFields.nav_tax_latency_pct = 25
  }
  if (fd.nav_off_balance_items != null && Number.isFinite(Number(fd.nav_off_balance_items)))
    adaptiveFields.nav_off_balance_items = Number(fd.nav_off_balance_items)
  if (
    fd.nav_real_estate_book_value != null &&
    Number.isFinite(Number(fd.nav_real_estate_book_value))
  )
    adaptiveFields.nav_real_estate_book_value = Number(fd.nav_real_estate_book_value)
  if (
    fd.nav_real_estate_appraisal_value != null &&
    Number.isFinite(Number(fd.nav_real_estate_appraisal_value))
  )
    adaptiveFields.nav_real_estate_appraisal_value = Number(fd.nav_real_estate_appraisal_value)
  if (fd.nav_per_asset_tax_rates && typeof fd.nav_per_asset_tax_rates === 'object') {
    const cleaned: Record<string, number> = {}
    for (const [k, v] of Object.entries(fd.nav_per_asset_tax_rates)) {
      if (v != null && Number.isFinite(Number(v))) {
        cleaned[k] = Math.min(Math.max(Number(v), 0), 100)
      }
    }
    if (Object.keys(cleaned).length > 0) adaptiveFields.nav_per_asset_tax_rates = cleaned
  }
  if (
    fd.nav_equipment_revaluation &&
    typeof fd.nav_equipment_revaluation === 'object' &&
    Object.values(fd.nav_equipment_revaluation).some((v) => v != null && Number.isFinite(Number(v)))
  ) {
    adaptiveFields.nav_equipment_revaluation = fd.nav_equipment_revaluation
  }

  if (fd.taxable_profit != null && Number.isFinite(Number(fd.taxable_profit)))
    adaptiveFields.taxable_profit = Number(fd.taxable_profit)
  if (fd.director_remuneration != null && Number.isFinite(Number(fd.director_remuneration)))
    adaptiveFields.director_remuneration = Number(fd.director_remuneration)
  if (fd.is_financial_company != null)
    adaptiveFields.is_financial_company = Boolean(fd.is_financial_company)
  if (fd.is_holding_more_than_50pct_shares != null)
    adaptiveFields.is_holding_more_than_50pct_shares = Boolean(fd.is_holding_more_than_50pct_shares)
  if (fd.sme_rate_override != null) adaptiveFields.sme_rate_override = Boolean(fd.sme_rate_override)
  if (fd.deal_type) adaptiveFields.deal_type = fd.deal_type
  if (fd.deal_goodwill_amount != null && Number.isFinite(Number(fd.deal_goodwill_amount)))
    adaptiveFields.deal_goodwill_amount = Number(fd.deal_goodwill_amount)
  if (fd.deal_seller_share_basis != null && Number.isFinite(Number(fd.deal_seller_share_basis)))
    adaptiveFields.deal_seller_share_basis = Number(fd.deal_seller_share_basis)
  if (fd.deal_seller_is_individual != null)
    adaptiveFields.deal_seller_is_individual = Boolean(fd.deal_seller_is_individual)
  if (
    fd.deal_buyer_discount_rate_pct != null &&
    Number.isFinite(Number(fd.deal_buyer_discount_rate_pct))
  )
    adaptiveFields.deal_buyer_discount_rate_pct = Number(fd.deal_buyer_discount_rate_pct)
  if (
    fd.deal_registration_duty_pct != null &&
    Number.isFinite(Number(fd.deal_registration_duty_pct))
  )
    adaptiveFields.deal_registration_duty_pct = Number(fd.deal_registration_duty_pct)

  copyDefinedAdaptiveFields(adaptiveFields, fd, [
    'saas_arr',
    'saas_mrr',
    'saas_arr_growth_pct',
    'saas_churn_pct',
    'saas_customer_churn_pct',
    'saas_nrr_pct',
    'saas_gross_margin_pct',
    'saas_cac',
    'saas_customer_concentration_pct',
    'saas_expansion_revenue_pct',
    'saas_sm_spend',
  ])

  if (
    fd.rev_recurring_amount != null &&
    Number.isFinite(fd.rev_recurring_amount) &&
    latestRevenue &&
    latestRevenue > 0
  ) {
    adaptiveFields.rev_recurring_pct = Math.min(
      Math.max((fd.rev_recurring_amount / latestRevenue) * 100, 0),
      100
    )
  } else if (fd.rev_recurring_pct != null && Number.isFinite(fd.rev_recurring_pct)) {
    adaptiveFields.rev_recurring_pct = fd.rev_recurring_pct
  }
  if (
    fd.rev_top_client_amount != null &&
    Number.isFinite(fd.rev_top_client_amount) &&
    latestRevenue &&
    latestRevenue > 0
  ) {
    adaptiveFields.rev_top_client_concentration_pct = Math.min(
      Math.max((fd.rev_top_client_amount / latestRevenue) * 100, 0),
      100
    )
  } else if (
    fd.rev_top_client_concentration_pct != null &&
    Number.isFinite(fd.rev_top_client_concentration_pct)
  ) {
    adaptiveFields.rev_top_client_concentration_pct = fd.rev_top_client_concentration_pct
  }
  if (fd.rev_contract_backlog != null) adaptiveFields.rev_contract_backlog = fd.rev_contract_backlog
  if (fd.rev_gross_churn_pct != null) adaptiveFields.rev_gross_churn_pct = fd.rev_gross_churn_pct
  if (fd.rev_capitalized_rd_amount != null && Number.isFinite(fd.rev_capitalized_rd_amount)) {
    adaptiveFields.rev_capitalized_rd_amount = fd.rev_capitalized_rd_amount
  }

  const existingBusinessContext =
    formData.business_context && typeof formData.business_context === 'object'
      ? formData.business_context
      : undefined

  const businessContext = formData.business_type_id
    ? {
        ...existingBusinessContext,
        dcfPreference: fd._internal_dcf_preference,
        multiplesPreference: fd._internal_multiples_preference,
        ownerDependencyImpact: fd._internal_owner_dependency_impact,
        keyMetrics: fd._internal_key_metrics,
        typicalEmployeeRange: fd._internal_typical_employee_range,
        typicalRevenueRange: fd._internal_typical_revenue_range,
        ...adaptiveFields,
      }
    : Object.keys(adaptiveFields).length > 0
      ? {
          ...existingBusinessContext,
          ...adaptiveFields,
        }
      : existingBusinessContext
        ? existingBusinessContext
        : undefined

  return { businessContext, userConfiguredDcf }
}

function copyDefinedAdaptiveFields(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  keys: string[]
): void {
  for (const key of keys) {
    if (source[key] != null) target[key] = source[key]
  }
}
