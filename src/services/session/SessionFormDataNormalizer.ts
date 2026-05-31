import type { ValuationRequest } from '../../types/valuation'
import { normalizeBusinessTypeId } from '../../utils/businessTypeIdAliases'
import {
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../../utils/fiscalYear'
import {
  OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
  SKIP_BUSINESS_CONTEXT_SCALAR_PROMOTE,
} from '../../utils/optionalSessionPrefillKeys'

type SessionRecord = Record<string, unknown>

function isRecord(value: unknown): value is SessionRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function snakeToCamelAlias(key: string): string | null {
  if (!key || key.startsWith('_')) return null
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function toOptionalNumeric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function isPlaceholderNumeric(value: unknown): boolean {
  const numeric = toOptionalNumeric(value)
  return numeric == null || numeric === 0
}

function hasRealRevenueOrEbitda(row: { revenue?: number; ebitda?: number }): boolean {
  return (row.revenue != null && row.revenue !== 0) || (row.ebitda != null && row.ebitda !== 0)
}

function buildYearRowsFromMap(
  yearData: unknown
): Map<number, { year: number; revenue?: number; ebitda?: number }> {
  const yearRowsFromMap = new Map<number, { year: number; revenue?: number; ebitda?: number }>()
  if (!yearData || typeof yearData !== 'object' || Array.isArray(yearData)) {
    return yearRowsFromMap
  }

  for (const rawYear of Object.keys(yearData)) {
    const year = Number(rawYear)
    if (!Number.isFinite(year) || year < 2000 || year > 2100) continue
    const row = (yearData as Record<string, unknown>)[rawYear]
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const rowObj = row as Record<string, unknown>
    yearRowsFromMap.set(year, {
      year,
      revenue: toOptionalNumeric(rowObj.revenue),
      ebitda: toOptionalNumeric(rowObj.ebitda),
    })
  }

  return yearRowsFromMap
}

function mergeYearDataIntoHistoricalRows(
  fd: Record<string, unknown>,
  yearRowsFromMap: Map<number, { year: number; revenue?: number; ebitda?: number }>
): void {
  if (!fd.historical_years_data && yearRowsFromMap.size > 0) {
    const years = Array.from(yearRowsFromMap.keys())
    if (years.length > 0) {
      fd.historical_years_data = years
        .sort((a, b) => a - b)
        .map((year) => {
          const data = yearRowsFromMap.get(year)
          return {
            year,
            revenue: data?.revenue ?? 0,
            ebitda: data?.ebitda ?? 0,
          }
        })
    }
  }

  if (Array.isArray(fd.historical_years_data) && yearRowsFromMap.size > 0) {
    const mergedByYear = new Map<number, { year: number; revenue?: number; ebitda?: number }>()
    for (const row of fd.historical_years_data as Array<{
      year?: number
      revenue?: number
      ebitda?: number
    }>) {
      if (!row || !Number.isFinite(Number(row.year))) continue
      const year = Number(row.year)
      mergedByYear.set(year, {
        year,
        revenue: toOptionalNumeric(row.revenue),
        ebitda: toOptionalNumeric(row.ebitda),
      })
    }
    for (const [year, incoming] of yearRowsFromMap.entries()) {
      const existing = mergedByYear.get(year)
      if (!existing) {
        mergedByYear.set(year, incoming)
        continue
      }
      const next = { ...existing }
      if (isPlaceholderNumeric(next.revenue) && incoming.revenue != null) {
        next.revenue = incoming.revenue
      }
      if (isPlaceholderNumeric(next.ebitda) && incoming.ebitda != null) {
        next.ebitda = incoming.ebitda
      }
      mergedByYear.set(year, next)
    }
    fd.historical_years_data = Array.from(mergedByYear.values()).sort((a, b) => a.year - b.year)
  }
}

function normalizeFinancialRows(
  fd: Record<string, unknown>,
  yearRowsFromMap: Map<number, { year: number; revenue?: number; ebitda?: number }>
): void {
  mergeYearDataIntoHistoricalRows(fd, yearRowsFromMap)

  if (Array.isArray(fd.historical_years_data)) {
    fd.historical_years_data = normalizeHistoricalYearsForFiling(
      fd.historical_years_data as Array<{ year: number; revenue?: number; ebitda?: number }>,
      fd.filing_year_confirmed
    )
  }

  const cyd = fd.current_year_data as
    | { year?: number; revenue?: number | null; ebitda?: number | null }
    | undefined
  if (cyd) {
    cyd.year = normalizeCurrentYearForFiling(cyd.year, fd.filing_year_confirmed)
    if (cyd.year != null) {
      const candidate = yearRowsFromMap.get(cyd.year)
      if (candidate && hasRealRevenueOrEbitda(candidate)) {
        if (isPlaceholderNumeric(cyd.revenue) && candidate.revenue != null) {
          cyd.revenue = candidate.revenue
        }
        if (isPlaceholderNumeric(cyd.ebitda) && candidate.ebitda != null) {
          cyd.ebitda = candidate.ebitda
        }
      }
    }
  }
  if (cyd && (fd.revenue === undefined || fd.ebitda === undefined)) {
    if (fd.revenue === undefined && cyd.revenue != null) fd.revenue = Number(cyd.revenue)
    if (fd.ebitda === undefined && cyd.ebitda != null) fd.ebitda = Number(cyd.ebitda)
  }
}

function normalizeActivityFields(fd: Record<string, unknown>): void {
  const canonicalRaw =
    (typeof fd.canonical_nace_code === 'string' && fd.canonical_nace_code.trim()) ||
    (typeof fd.nace_code === 'string' && fd.nace_code.trim()) ||
    ''
  if (canonicalRaw) {
    fd.canonical_nace_code = canonicalRaw
    fd.nace_code = canonicalRaw
  }
  const activityLabel =
    (typeof fd.activity_label === 'string' && fd.activity_label.trim()) ||
    (typeof fd.nace_description === 'string' && fd.nace_description.trim()) ||
    ''
  if (activityLabel) {
    fd.nace_description = activityLabel
  }
}

function promoteAdaptiveFieldsFromBusinessContext(
  fd: Record<string, unknown>,
  sessionData: Record<string, unknown>
): void {
  const rawBc = fd.business_context ?? sessionData.business_context ?? sessionData.businessContext
  if (!rawBc || typeof rawBc !== 'object' || Array.isArray(rawBc)) return
  const bc = rawBc as Record<string, unknown>
  const hasScalarValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return false
    if (typeof value === 'string') return value.trim().length > 0
    return true
  }
  const hasStructValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value as object).length > 0
    return true
  }

  for (const key of OPTIONAL_SESSION_PREFILL_SCALAR_KEYS) {
    if (SKIP_BUSINESS_CONTEXT_SCALAR_PROMOTE.has(key)) continue
    const cur = fd[key]
    if (hasScalarValue(cur)) continue
    const incoming = bc[key]
    if (hasScalarValue(incoming)) {
      fd[key] = incoming
    }
  }

  for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) {
    const cur = fd[key]
    if (hasStructValue(cur)) continue
    const incoming = bc[key]
    if (hasStructValue(incoming)) {
      fd[key] = incoming
    }
  }

  const camelToInternal: [string, string][] = [
    ['keyMetrics', '_internal_key_metrics'],
    ['typicalEmployeeRange', '_internal_typical_employee_range'],
    ['typicalRevenueRange', '_internal_typical_revenue_range'],
    ['dcfPreference', '_internal_dcf_preference'],
    ['multiplesPreference', '_internal_multiples_preference'],
    ['ownerDependencyImpact', '_internal_owner_dependency_impact'],
  ]
  for (const [camel, snake] of camelToInternal) {
    const cur = fd[snake]
    if (cur !== undefined && cur !== null) continue
    const incoming = bc[camel]
    if (incoming !== undefined && incoming !== null) {
      fd[snake] = incoming
    }
  }
}

function buildFieldMappings(): [string, ...string[]][] {
  const fieldMappings: [string, ...string[]][] = [
    ['company_name', 'companyName'],
    ['country_code', 'countryCode'],
    ['industry'],
    ['business_model', 'businessModel'],
    ['founding_year', 'foundingYear'],
    ['current_year_data', 'currentYearData'],
    ['historical_years_data', 'historicalYearsData'],
    ['forecast_years_data', 'forecastYearsData'],
    ['filing_year_confirmed', 'filingYearConfirmed'],
    ['number_of_employees', 'numberOfEmployees', 'employee_count', 'employeeCount'],
    ['number_of_owners', 'numberOfOwners'],
    ['recurring_revenue_percentage', 'recurringRevenuePercentage'],
    ['shares_for_sale', 'sharesForSale'],
    ['business_type', 'businessType'],
    ['revenue'],
    ['business_description', 'businessDescription'],
    ['business_highlights', 'businessHighlights'],
    ['reason_for_selling', 'reasonForSelling'],
    ['city'],
    ['kbo_number', 'kboNumber'],
    ['vat_number', 'vatNumber'],
    ['postal_code', 'postalCode'],
    ['legal_form', 'legalForm'],
    ['nace_code', 'naceCode'],
    ['nace_description', 'naceDescription'],
    ['activity_code', 'activityCode'],
    ['activity_label', 'activityLabel'],
    ['taxonomy'],
    ['canonical_nace_code', 'canonicalNaceCode'],
    ['business_type_id', 'businessTypeId'],
    ['business_context', 'businessContext'],
    ['government_bond_yield', 'governmentBondYield'],
    ['long_term_gdp_growth', 'longTermGdpGrowth'],
    ['ebitda'],
    ['use_dcf', 'useDcf'],
    ['use_multiples', 'useMultiples'],
    ['user_configured_dcf', 'userConfiguredDcf'],
    ['projection_years', 'projectionYears'],
    ['comparables'],
    ['_normalizations'],
    ['_taxLatencies'],
    ['_import_quality'],
    ['nav_real_estate_adjustment', 'navRealEstateAdjustment'],
    ['nav_inventory_adjustment', 'navInventoryAdjustment'],
    ['nav_hidden_reserves', 'navHiddenReserves'],
    ['nav_goodwill_writeoff', 'navGoodwillWriteoff'],
    ['nav_receivables_adjustment', 'navReceivablesAdjustment'],
    ['nav_other_revaluations', 'navOtherRevaluations'],
    ['nav_tax_latency_pct', 'navTaxLatencyPct'],
    ['nav_off_balance_items', 'navOffBalanceItems'],
    ['real_estate_treatment', 'realEstateTreatment'],
    ['real_estate_market_value', 'realEstateMarketValue'],
    ['exclude_real_estate', 'excludeRealEstate'],
    ['real_estate_book_value', 'realEstateBookValue'],
    ['estimated_market_rent', 'estimatedMarketRent'],
    ['multiple_calibration_adjustment', 'multipleCalibrationAdjustment'],
    ['multiple_calibration_note', 'multipleCalibrationNote'],
    ['historical_ebitda_weighting_mode', 'historicalEbitdaWeightingMode'],
    ['historical_ebitda_weights', 'historicalEbitdaWeights'],
    ['show_enterprise_to_equity_bridge', 'showEnterpriseToEquityBridge'],
    ['owner_salary_addback', 'ownerSalaryAddback'],
    ['dcf_input_mode', 'dcfInputMode'],
    ['dcf_revenue_growth_pct', 'dcfRevenueGrowthPct'],
    ['dcf_ebitda_margin_pct', 'dcfEbitdaMarginPct'],
    ['dcf_capex_pct', 'dcfCapexPct'],
    ['dcf_da_pct', 'dcfDaPct'],
    ['dcf_nwc_pct', 'dcfNwcPct'],
    ['dcf_tax_rate_pct', 'dcfTaxRatePct'],
    ['dcf_wacc_pct', 'dcfWaccPct'],
    ['dcf_terminal_growth_pct', 'dcfTerminalGrowthPct'],
    ['dcf_exit_multiple', 'dcfExitMultiple'],
    ['dcf_risk_free_rate_pct', 'dcfRiskFreeRatePct'],
    ['dcf_equity_risk_premium_pct', 'dcfEquityRiskPremiumPct'],
    ['dcf_beta', 'dcfBeta'],
    ['dcf_cost_of_debt_pct', 'dcfCostOfDebtPct'],
    ['dcf_cost_of_debt_pct', 'dcfCostOfDebtPct'],
    ['dcf_debt_equity_pct', 'dcfDebtEquityPct'],
    ['dcf_tax_shield_pct', 'dcfTaxShieldPct'],
    ['dcf_discounting_convention', 'dcfDiscountingConvention'],
    ['dcf_tax_shield_projections', 'dcfTaxShieldProjections'],
    ['dcf_terminal_value_method', 'dcfTerminalValueMethod'],
    ['subIndustry'],
    ['net_income', 'netIncome'],
    ['owner_role', 'ownerRole'],
    ['owner_hours', 'ownerHours'],
    ['delegation_capability', 'delegationCapability'],
    ['succession_plan', 'successionPlan'],
    ['saas_arr', 'saasArr'],
    ['saas_mrr', 'saasMrr'],
    ['saas_arr_growth_pct', 'saasArrGrowthPct'],
    ['saas_churn_pct', 'saasChurnPct'],
    ['saas_customer_churn_pct', 'saasCustomerChurnPct'],
    ['saas_nrr_pct', 'saasNrrPct'],
    ['saas_gross_margin_pct', 'saasGrossMarginPct'],
    ['saas_cac', 'saasCac'],
    ['saas_customer_concentration_pct', 'saasCustomerConcentrationPct'],
    ['saas_expansion_revenue_pct', 'saasExpansionRevenuePct'],
    ['saas_sm_spend', 'saasSmSpend'],
    ['rev_recurring_pct', 'revRecurringPct'],
    ['rev_recurring_amount', 'revRecurringAmount'],
    ['rev_top_client_concentration_pct', 'revTopClientConcentrationPct'],
    ['rev_top_client_amount', 'revTopClientAmount'],
    ['rev_contract_backlog', 'revContractBacklog'],
    ['rev_gross_churn_pct', 'revGrossChurnPct'],
    ['rev_capitalized_rd_amount', 'revCapitalizedRdAmount'],
    ['preparer_ev_ebitda_median', 'preparerEvEbitdaMedian'],
    ['preparer_ev_ebitda_override', 'preparerEvEbitdaOverride'],
    ['_internal_dcf_preference'],
    ['_internal_multiples_preference'],
    ['_internal_owner_dependency_impact'],
    ['_internal_key_metrics'],
    ['_internal_typical_employee_range'],
    ['_internal_typical_revenue_range'],
    ['tax_latencies', 'taxLatencies'],
    ['balance_sheet_adjustments', 'balanceSheetAdjustments'],
    ['official_financials', 'officialFinancials'],
    ['official_variance_analysis', 'officialVarianceAnalysis'],
    ['official_verification_badge', 'officialVerificationBadge'],
    ['year_data', 'yearData'],
    ['import_quality', 'importQuality'],
    ['_imported_ledger_analysis'],
    ['_imported_saas_metrics'],
    ['_imported_saas_provenance'],
    ['_financial_data_source'],
  ]

  const existingPrimary = new Set(fieldMappings.map(([primary]) => primary))
  const appendOptionalMapping = (key: string) => {
    if (existingPrimary.has(key)) return
    const camel = snakeToCamelAlias(key)
    const tuple = (camel ? [key, camel] : [key]) as [string, ...string[]]
    fieldMappings.push(tuple)
    existingPrimary.add(key)
  }
  for (const key of OPTIONAL_SESSION_PREFILL_SCALAR_KEYS) appendOptionalMapping(key)
  for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) appendOptionalMapping(key)

  return fieldMappings
}

/**
 * Extract form data from session data.
 * Handles both camelCase and snake_case field names.
 */
export function extractFormData(sessionData: SessionRecord): Partial<ValuationRequest> {
  if (!isRecord(sessionData)) {
    return {}
  }

  const formData: Partial<ValuationRequest> = {}
  const formDataRecord = formData as SessionRecord

  for (const [primaryKey, ...alternatives] of buildFieldMappings()) {
    let value = sessionData[primaryKey]

    if (value === undefined || value === null) {
      for (const alt of alternatives) {
        if (sessionData[alt] !== undefined && sessionData[alt] !== null) {
          value = sessionData[alt]
          break
        }
      }
    }

    if (value !== undefined && value !== null) {
      formDataRecord[primaryKey] = value
    }
  }

  if (Object.keys(formData).length > 0) {
    ;(formData as Partial<ValuationRequest>).shares_for_sale = 100
  }

  const fd = formData as Record<string, unknown>
  const businessTypeId = normalizeBusinessTypeId(fd.business_type_id)
  if (businessTypeId) {
    fd.business_type_id = businessTypeId
  }
  const yearRowsFromMap = buildYearRowsFromMap(sessionData.year_data ?? sessionData.yearData)
  normalizeFinancialRows(fd, yearRowsFromMap)
  normalizeActivityFields(fd)
  promoteAdaptiveFieldsFromBusinessContext(fd, sessionData as Record<string, unknown>)

  return formData
}
