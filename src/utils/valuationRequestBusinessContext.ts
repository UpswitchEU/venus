import { readPreSelectedValuationMethods } from '../constants/sessionUiKeys'
import type { ValuationFormData, ValuationRequest } from '../types/valuation'
import { normalizeBusinessTypeId } from './businessTypeIdAliases'
import { parseFlexibleNumber } from './isFiniteNumeric'

interface BuildValuationBusinessContextOptions {
  formData: ValuationFormData
  latestRevenue: number | undefined
  countryCode: string
  rawForecastData: NonNullable<ValuationFormData['historical_years_data']>
  inputSource?: string
}

export function buildValuationBusinessContext({
  formData,
  latestRevenue,
  countryCode,
  rawForecastData,
  inputSource,
}: BuildValuationBusinessContextOptions): {
  businessContext: ValuationRequest['business_context']
  userConfiguredDcf: boolean
} {
  const fd = formData as ValuationFormData & Record<string, unknown>
  const adaptiveFields: Record<string, unknown> = {}

  copyFiniteAdaptiveFields(adaptiveFields, fd, [
    'dcf_revenue_growth_pct',
    'dcf_ebitda_margin_pct',
    'dcf_capex_pct',
    'dcf_da_pct',
    'dcf_nwc_pct',
    'dcf_tax_rate_pct',
    'dcf_wacc_pct',
    'dcf_terminal_growth_pct',
    'dcf_exit_multiple',
    'dcf_risk_free_rate_pct',
    'dcf_equity_risk_premium_pct',
    'dcf_beta',
    'dcf_cost_of_debt_pct',
    'dcf_debt_equity_pct',
    'dcf_tax_shield_pct',
  ])
  if (
    fd.dcf_discounting_convention === 'mid_year' ||
    fd.dcf_discounting_convention === 'year_end'
  ) {
    adaptiveFields.dcf_discounting_convention = fd.dcf_discounting_convention
  }
  const dcfTaxShieldProjections = Array.isArray(fd.dcf_tax_shield_projections)
    ? fd.dcf_tax_shield_projections
        .map((value) => parseFlexibleNumber(value))
        .filter((value): value is number => value !== undefined)
    : []
  if (dcfTaxShieldProjections.length > 0) {
    adaptiveFields.dcf_tax_shield_projections = dcfTaxShieldProjections
  }
  const resolvedDcfInputSource = resolveDcfInputSource(fd, formData, inputSource)
  if (fd.dcf_input_mode === 'fcff_only') {
    adaptiveFields.dcf_input_mode = 'fcff_only'
  }
  if (dcfTaxShieldProjections.length > 0) {
    adaptiveFields.apv_input_source = resolvedDcfInputSource
    adaptiveFields.dcf_tax_shield_source = resolvedDcfInputSource
    adaptiveFields.dcf_bridge_policy = 'apv_tax_shield_inside_dcf'
    adaptiveFields.dcf_double_counting_guard = true
    if (fd.dcf_input_mode === 'fcff_only' && fd.dcf_discounting_convention === 'year_end') {
      adaptiveFields.dcf_benchmark_case = 'henk_customer_dcf_template'
    }
  }

  const userConfiguredDcf = isExplicitUserDcfIntent(fd, formData, dcfTaxShieldProjections.length)

  copyFiniteAdaptiveFields(adaptiveFields, fd, [
    'nav_real_estate_adjustment',
    'nav_inventory_adjustment',
    'nav_hidden_reserves',
    'nav_goodwill_writeoff',
    'nav_receivables_adjustment',
    'nav_other_revaluations',
    'nav_off_balance_items',
    'nav_real_estate_book_value',
    'nav_real_estate_appraisal_value',
  ])
  const navTaxLatencyPct = parseFlexibleNumber(fd.nav_tax_latency_pct)
  if (navTaxLatencyPct !== undefined) {
    adaptiveFields.nav_tax_latency_pct = Math.min(Math.max(navTaxLatencyPct, 0), 100)
  } else if (countryCode === 'BE') {
    adaptiveFields.nav_tax_latency_pct = 25
  }
  if (fd.nav_per_asset_tax_rates && typeof fd.nav_per_asset_tax_rates === 'object') {
    const cleaned: Record<string, number> = {}
    for (const [k, v] of Object.entries(fd.nav_per_asset_tax_rates)) {
      const numericValue = parseFlexibleNumber(v)
      if (numericValue !== undefined) {
        cleaned[k] = Math.min(Math.max(numericValue, 0), 100)
      }
    }
    if (Object.keys(cleaned).length > 0) adaptiveFields.nav_per_asset_tax_rates = cleaned
  }
  if (fd.nav_equipment_revaluation && typeof fd.nav_equipment_revaluation === 'object') {
    const cleanedEquipmentRevaluation: Record<string, number> = {}
    for (const [key, value] of Object.entries(fd.nav_equipment_revaluation)) {
      const numericValue = parseFlexibleNumber(value)
      if (numericValue !== undefined) cleanedEquipmentRevaluation[key] = numericValue
    }
    if (Object.keys(cleanedEquipmentRevaluation).length > 0) {
      adaptiveFields.nav_equipment_revaluation = cleanedEquipmentRevaluation
    }
  }

  copyFiniteAdaptiveFields(adaptiveFields, fd, ['taxable_profit', 'director_remuneration'])
  if (fd.is_financial_company != null)
    adaptiveFields.is_financial_company = Boolean(fd.is_financial_company)
  if (fd.is_holding_more_than_50pct_shares != null)
    adaptiveFields.is_holding_more_than_50pct_shares = Boolean(fd.is_holding_more_than_50pct_shares)
  if (fd.sme_rate_override != null) adaptiveFields.sme_rate_override = Boolean(fd.sme_rate_override)
  if (fd.deal_type) adaptiveFields.deal_type = fd.deal_type
  copyFiniteAdaptiveFields(adaptiveFields, fd, ['deal_goodwill_amount', 'deal_seller_share_basis'])
  if (fd.deal_seller_is_individual != null)
    adaptiveFields.deal_seller_is_individual = Boolean(fd.deal_seller_is_individual)
  const dealBuyerDiscountRatePct = parseFlexibleNumber(fd.deal_buyer_discount_rate_pct)
  if (dealBuyerDiscountRatePct !== undefined)
    adaptiveFields.deal_buyer_discount_rate_pct = dealBuyerDiscountRatePct
  const dealRegistrationDutyPct = parseFlexibleNumber(fd.deal_registration_duty_pct)
  if (dealRegistrationDutyPct !== undefined)
    adaptiveFields.deal_registration_duty_pct = dealRegistrationDutyPct

  copyFiniteAdaptiveFields(adaptiveFields, fd, [
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

  const revRecurringAmount = parseFlexibleNumber(fd.rev_recurring_amount)
  const revRecurringPct = parseFlexibleNumber(fd.rev_recurring_pct)
  const revTopClientAmount = parseFlexibleNumber(fd.rev_top_client_amount)
  const revTopClientConcentrationPct = parseFlexibleNumber(fd.rev_top_client_concentration_pct)
  const revContractBacklog = parseFlexibleNumber(fd.rev_contract_backlog)
  const revGrossChurnPct = parseFlexibleNumber(fd.rev_gross_churn_pct)
  const revCapitalizedRdAmount = parseFlexibleNumber(fd.rev_capitalized_rd_amount)

  if (revRecurringAmount !== undefined) {
    adaptiveFields.rev_recurring_amount = revRecurringAmount
  }
  if (revRecurringAmount !== undefined && latestRevenue && latestRevenue > 0) {
    adaptiveFields.rev_recurring_pct = Math.min(
      Math.max((revRecurringAmount / latestRevenue) * 100, 0),
      100
    )
  } else if (revRecurringPct !== undefined) {
    adaptiveFields.rev_recurring_pct = revRecurringPct
  }
  if (revTopClientAmount !== undefined) {
    adaptiveFields.rev_top_client_amount = revTopClientAmount
  }
  if (revTopClientAmount !== undefined && latestRevenue && latestRevenue > 0) {
    adaptiveFields.rev_top_client_concentration_pct = Math.min(
      Math.max((revTopClientAmount / latestRevenue) * 100, 0),
      100
    )
  } else if (revTopClientConcentrationPct !== undefined) {
    adaptiveFields.rev_top_client_concentration_pct = revTopClientConcentrationPct
  }
  if (revContractBacklog !== undefined) adaptiveFields.rev_contract_backlog = revContractBacklog
  if (revGrossChurnPct !== undefined) adaptiveFields.rev_gross_churn_pct = revGrossChurnPct
  if (revCapitalizedRdAmount !== undefined)
    adaptiveFields.rev_capitalized_rd_amount = revCapitalizedRdAmount

  const existingBusinessContext =
    formData.business_context && typeof formData.business_context === 'object'
      ? formData.business_context
      : undefined
  const businessTypeId = normalizeBusinessTypeId(formData.business_type_id)

  const businessContext = formData.business_type_id
    ? {
        ...existingBusinessContext,
        ...(businessTypeId ? { business_type_id: businessTypeId } : {}),
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

function copyFiniteAdaptiveFields(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  keys: string[]
): void {
  for (const key of keys) {
    const value = parseFlexibleNumber(source[key])
    if (value !== undefined) target[key] = value
  }
}

/** True when the advisor deliberately chose DCF (not auto-seeded defaults alone). */
export function isExplicitUserDcfIntent(
  fd: Record<string, unknown>,
  formData: ValuationFormData,
  dcfTaxShieldProjectionCount = 0
): boolean {
  if (fd.dcf_input_mode === 'fcff_only') return true
  if (parseFlexibleNumber(fd.dcf_exit_multiple) !== undefined) return true
  if (fd.dcf_discounting_convention === 'year_end') return true
  if (dcfTaxShieldProjectionCount > 0) return true

  const weights = formData.user_weights
  if (weights && typeof weights === 'object' && !Array.isArray(weights)) {
    for (const [key, raw] of Object.entries(weights)) {
      const weight = parseFlexibleNumber(raw)
      if (key.toLowerCase().includes('dcf') && weight !== undefined && weight > 0) {
        return true
      }
    }
  }

  const selected = formData.selected_method ?? fd.selected_method
  if (typeof selected === 'string' && selected.toLowerCase().includes('dcf')) {
    return true
  }

  const preSelected =
    (Array.isArray(fd._pre_selected_valuation_methods)
      ? fd._pre_selected_valuation_methods
      : undefined) ?? readPreSelectedValuationMethods(formData)
  if (Array.isArray(preSelected)) {
    for (const method of preSelected) {
      if (typeof method === 'string' && method.toLowerCase().includes('dcf')) {
        return true
      }
    }
  }

  return false
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function resolveDcfInputSource(
  fd: Record<string, unknown>,
  formData: ValuationFormData,
  inputSource?: string
): string {
  const explicit =
    asNonEmptyString(fd.apv_input_source) ||
    asNonEmptyString(fd.dcf_tax_shield_source) ||
    asNonEmptyString(fd.dcf_input_source) ||
    asNonEmptyString(fd._financial_data_source) ||
    asNonEmptyString(inputSource)
  if (explicit) return explicit

  const official =
    formData.official_financials && typeof formData.official_financials === 'object'
      ? (formData.official_financials as Record<string, unknown>)
      : undefined
  const officialSource =
    asNonEmptyString(official?.provider) ||
    asNonEmptyString(official?.source) ||
    asNonEmptyString(official?.data_source)
  if (officialSource) return `integration:${officialSource}`

  return 'manual'
}
