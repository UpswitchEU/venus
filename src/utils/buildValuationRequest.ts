/**
 * Build Valuation Request
 *
 * Single Responsibility: Build ValuationRequest from formData or DataResponse[]
 * Unified function used by both manual and conversational flows
 *
 * @module utils/buildValuationRequest
 */

import { useNormalizationStore } from '../store/useNormalizationStore'
import { useEbitdaNormalizationStore } from '../store/useEbitdaNormalizationStore'
import { useTaxLatencyStore } from '../store/useTaxLatencyStore'
import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'
import type { DataResponse } from '../types/data-collection'
import { ValidationError } from '../types/errors'
import type { ValuationFormData, ValuationRequest } from '../types/valuation'
import { convertDataResponsesToFormData } from './dataCollectionUtils'
import { getCurrentFilingYear } from './fiscalYear'
import { generalLogger } from './logger'

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function requirePositiveRevenue(value: unknown, field: string): number {
  const revenue = toFiniteNumber(value)

  if (revenue === null || revenue <= 0) {
    throw new ValidationError('Revenue is required and must be greater than 0.', field, value)
  }

  return revenue
}

const YEAR_DATA_OPTIONAL_FIELDS = [
  'cogs',
  'gross_profit',
  'operating_expenses',
  'ebit',
  'depreciation',
  'amortization',
  'interest_expense',
  'tax_expense',
  'net_income',
  'total_assets',
  'current_assets',
  'cash',
  'accounts_receivable',
  'inventory',
  'total_liabilities',
  'current_liabilities',
  'total_debt',
  'total_equity',
  'nwc_change',
] as const

const NON_NEGATIVE_YEAR_FIELDS = new Set<string>([
  'cogs',
  'operating_expenses',
  'depreciation',
  'amortization',
  'total_assets',
  'current_assets',
  'cash',
  'accounts_receivable',
  'inventory',
  'total_liabilities',
  'current_liabilities',
  'total_debt',
])

function pickOptionalYearDataFields(source: unknown): Record<string, number> {
  if (source === undefined || source === null || typeof source !== 'object') {
    return {}
  }

  const record = source as Record<string, unknown>
  const result: Record<string, number> = {}

  for (const field of YEAR_DATA_OPTIONAL_FIELDS) {
    const numeric = toFiniteNumber(record[field])
    if (numeric === null) {
      continue
    }
    if (NON_NEGATIVE_YEAR_FIELDS.has(field) && numeric < 0) {
      continue
    }
    result[field] = numeric
  }

  return result
}

/**
 * Build ValuationRequest from formData or DataResponse[]
 *
 * Unified function that normalizes data and builds ValuationRequest ready for API.
 * Used by both manual flow (formData) and conversational flow (DataResponse[]).
 *
 * Normalization Rules (from DATA_FLOW.md):
 * - Year validation (2000-2100)
 * - Recurring revenue clamping (0.0-1.0)
 * - Company name trimming
 * - Country code uppercase
 * - Industry/business model defaults
 * - Financial data merging
 * - Historical data filtering
 * - Sole trader handling
 * - Business context mapping
 *
 * @param source - Either ValuationFormData or DataResponse[] array
 * @param overrideItems - If provided, use these normalizations instead of reading from the store.
 *                        Eliminates a redundant store read when the caller already has the items.
 * @param locale - Report language ('nl' or 'en'). Passed through to ValuationIQ for i18n.
 * @returns ValuationRequest ready for calculateValuation()
 */
export function buildValuationRequest(
  source: ValuationFormData | DataResponse[],
  overrideItems?: NormalizationItem[],
  locale?: 'nl' | 'en',
): ValuationRequest {
  // Convert DataResponse[] to formData if needed
  let formData: ValuationFormData
  if (Array.isArray(source)) {
    formData = convertDataResponsesToFormData(source) as ValuationFormData
  } else {
    formData = source
  }

  // Normalize last full year (2000-2100)
  const lastFullYear = getCurrentFilingYear()

  // Normalize founding year (1900-2100)
  const foundingYear = Math.min(Math.max(formData.founding_year || lastFullYear - 5, 1900), 2100)

  // Normalize company name
  const companyName = formData.company_name?.trim() || 'Unknown Company'

  // Normalize country code (2-letter uppercase)
  const countryCode = (formData.country_code || 'BE').toUpperCase().substring(0, 2)

  // Normalize industry and business model
  // Priority: formData.industry > business_type metadata > default
  // Note: When business_type_id is selected, industry should be set in formData
  // by BasicInformationSection.tsx, but we ensure it's not empty here
  let industry = formData.industry
  let businessModel = formData.business_model

  // If industry is missing but business_type_id is present, log warning
  // (industry should have been set when business type was selected)
  if (!industry && formData.business_type_id) {
    generalLogger.warn(
      '[buildValuationRequest] Industry missing despite business_type_id being set',
      {
        business_type_id: formData.business_type_id,
      }
    )
  }

  // Apply defaults only if still missing
  industry = industry || 'services'
  businessModel = businessModel || 'services'

  // Normalize financial data.
  // Revenue: treat 0 as a valid value (pre-revenue startup). Only fall back to
  // current_year_data when the form field is truly absent (null/undefined).
  const rawRevenue =
    formData.revenue != null
      ? Number(formData.revenue)
      : formData.current_year_data?.revenue != null
        ? Number(formData.current_year_data.revenue)
        : null
  const revenue = requirePositiveRevenue(rawRevenue, 'current_year_data.revenue')

  // EBITDA: accept 0 as a legitimate break-even value; only warn if truly absent.
  const rawEbitda =
    formData.ebitda !== undefined && formData.ebitda !== null
      ? Number(formData.ebitda)
      : formData.current_year_data?.ebitda !== undefined &&
          formData.current_year_data?.ebitda !== null
        ? Number(formData.current_year_data.ebitda)
        : null
  if (rawEbitda === null) {
    generalLogger.warn(
      '[buildValuationRequest] EBITDA is missing — using 0. Ensure the form validates EBITDA before submission.',
      { business_name: companyName, industry }
    )
  }
  const ebitda = rawEbitda ?? 0

  // Use provided items or read from store — avoids redundant getState() in recalculation paths
  const allItems = overrideItems ?? useNormalizationStore.getState().items
  const acceptedNorms = allItems.filter((n) => n.status === 'accepted')
  const legacyNormalizations = useEbitdaNormalizationStore.getState().normalizations

  // Separate historical actuals from explicit forecast projections.
  const actualHistoricalData =
    formData.historical_years_data?.filter((y) => !y.is_forecast) ?? []
  const rawForecastData =
    formData.forecast_years_data && formData.forecast_years_data.length > 0
      ? formData.forecast_years_data
      : formData.historical_years_data?.filter((y) => y.is_forecast) ?? []

  const historicalYears = actualHistoricalData
    .filter((y) => y.ebitda != null && y.year >= 2000 && y.year <= 2100)
    .map((y) => y.year)
  const allDataYears = Array.from(new Set([lastFullYear, ...historicalYears]))

  const yearEbitdaMap: Record<number, number> = {}
  yearEbitdaMap[lastFullYear] = ebitda
  actualHistoricalData.forEach((y) => {
    if (y.ebitda != null) yearEbitdaMap[y.year] = Number(y.ebitda)
  })

  // Build year-keyed normalization lookup from accepted items
  // CRITICAL: Respect applyAllYears and applyYears — items can apply to multiple years
  // Percentage/absolute types recalculate using year-specific EBITDA
  const normByYear: Record<number, { totalAdjustment: number; count: number; confidence: string }> =
    {}
  for (const n of acceptedNorms) {
    const yearsToApply: number[] = n.applyAllYears
      ? allDataYears
      : n.applyYears && n.applyYears.length > 0
        ? n.applyYears
        : [n.year]
    for (const y of yearsToApply) {
      if (!normByYear[y]) normByYear[y] = { totalAdjustment: 0, count: 0, confidence: 'medium' }
      const rawYearEbitda = yearEbitdaMap[y] ?? 0
      const yearEbitda = Number.isFinite(rawYearEbitda) ? rawYearEbitda : 0
      const val = Number.isFinite(Number(n.value)) ? Number(n.value) || 0 : 0
      let amount = Number.isFinite(Number(n.adjustment)) ? Number(n.adjustment) || 0 : 0
      if (n.type === 'add_percent') amount = (yearEbitda * val) / 100
      else if (n.type === 'subtract_percent') amount = -((yearEbitda * val) / 100)
      else if (n.type === 'absolute') amount = val - yearEbitda
      if (!Number.isFinite(amount)) amount = 0
      normByYear[y].totalAdjustment += amount
      normByYear[y].count++
      if (n.confidence === 'high') normByYear[y].confidence = 'high'
    }
  }

  // Backward-compatibility: ValuationForm still persists normalization input via the
  // legacy store/modal. If no unified normalization exists for a year, use the legacy
  // year total so accountant-entered form adjustments reach the calculation request.
  for (const [yearKey, legacy] of Object.entries(legacyNormalizations)) {
    const year = Number(yearKey)
    if (!Number.isFinite(year) || normByYear[year]) continue

    const adjustmentCount =
      (legacy.adjustments?.length || 0) + (legacy.custom_adjustments?.length || 0)
    const totalAdjustment = Number(legacy.total_adjustments)

    if (adjustmentCount === 0 && !Number.isFinite(totalAdjustment)) continue

    normByYear[year] = {
      totalAdjustment: Number.isFinite(totalAdjustment) ? totalAdjustment : 0,
      count: adjustmentCount,
      confidence: legacy.confidence_score || 'medium',
    }
  }

  // Check if last full year EBITDA is normalized
  const lastFullYearNormalization = normByYear[lastFullYear]

  // Build current_year_data with normalization support
  const currentYearData: any = {
    year: lastFullYear,
    revenue: revenue,
    ebitda: lastFullYearNormalization ? ebitda + lastFullYearNormalization.totalAdjustment : ebitda,
    ...(lastFullYearNormalization && {
      ebitda_normalized: true,
      ebitda_normalization_metadata: {
        reported_ebitda: ebitda,
        total_adjustments: lastFullYearNormalization.totalAdjustment,
        adjustment_count: lastFullYearNormalization.count,
        confidence_score: lastFullYearNormalization.confidence,
        has_custom_adjustments: false,
      },
    }),
    ...pickOptionalYearDataFields(formData.current_year_data),
  }

  // Normalize historical data (filter and sort) with normalization support
  const historicalYearsData =
    actualHistoricalData
      .filter(
        (year) =>
          year.ebitda !== undefined &&
          year.ebitda !== null &&
          year.year >= 2000 &&
          year.year <= 2100
      )
      .map((year) => {
        const clampedYear = Math.min(Math.max(year.year, 2000), 2100)

        const normalization = normByYear[year.year]

        if (normalization) {
          const reportedEbitda = Number(year.ebitda)
          const normalizedRevenue = requirePositiveRevenue(
            year.revenue,
            `historical_years_data.${year.year}.revenue`
          )
          return {
            year: clampedYear,
            revenue: normalizedRevenue,
            ebitda: reportedEbitda + normalization.totalAdjustment,
            ...pickOptionalYearDataFields(year),
            ebitda_normalized: true,
            ebitda_normalization_metadata: {
              reported_ebitda: reportedEbitda,
              total_adjustments: normalization.totalAdjustment,
              adjustment_count: normalization.count,
              confidence_score: normalization.confidence,
              has_custom_adjustments: false,
            },
          }
        }

        const normalizedRevenue = requirePositiveRevenue(
          year.revenue,
          `historical_years_data.${year.year}.revenue`
        )

        return {
          year: clampedYear,
          revenue: normalizedRevenue,
          ebitda: Number(year.ebitda),
          ...pickOptionalYearDataFields(year),
          ebitda_normalized: false,
        }
      })
      .sort((a, b) => a.year - b.year) || []

  const forecastYearsData =
    rawForecastData
      .filter((year) => year.year >= 2000 && year.year <= 2100)
      .map((year) => {
        const clampedYear = Math.min(Math.max(year.year, 2000), 2100)
        const revenue = toFiniteNumber(year.revenue)
        if (revenue === null || revenue < 0) {
          throw new ValidationError(
            'Forecast revenue must be a valid number and cannot be negative.',
            `forecast_years_data.${year.year}.revenue`,
            year.revenue
          )
        }

        const normalizedEbitda = toFiniteNumber(year.ebitda) ?? 0

        return {
          year: clampedYear,
          revenue,
          ebitda: normalizedEbitda,
          ...pickOptionalYearDataFields(year),
          is_forecast: true,
        }
      })
      .sort((a, b) => a.year - b.year) || []

  const historicalYearSet = new Set<number>()
  for (const year of historicalYearsData) {
    if (historicalYearSet.has(year.year)) {
      throw new ValidationError(
        `Historical year ${year.year} is duplicated. Each historical year must appear only once.`,
        'historical_years_data',
        year.year
      )
    }

    if (year.year >= lastFullYear) {
      throw new ValidationError(
        `Historical year ${year.year} must be earlier than the current fiscal year ${lastFullYear}.`,
        'historical_years_data',
        year.year
      )
    }

    historicalYearSet.add(year.year)
  }

  const forecastYearSet = new Set<number>()
  for (const year of forecastYearsData) {
    if (forecastYearSet.has(year.year)) {
      throw new ValidationError(
        `Forecast year ${year.year} is duplicated. Each forecast year must appear only once.`,
        'forecast_years_data',
        year.year
      )
    }

    if (historicalYearSet.has(year.year)) {
      throw new ValidationError(
        `Forecast year ${year.year} cannot duplicate a historical year.`,
        'forecast_years_data',
        year.year
      )
    }

    if (year.year <= lastFullYear) {
      throw new ValidationError(
        `Forecast year ${year.year} must be later than the current fiscal year ${lastFullYear}.`,
        'forecast_years_data',
        year.year
      )
    }

    forecastYearSet.add(year.year)
  }

  // Normalize recurring revenue percentage (0.0-1.0)
  const recurringRevenueInput =
    formData.recurring_revenue_percentage ??
    ((formData as any).rev_recurring_pct != null ? (formData as any).rev_recurring_pct / 100 : 0)
  const recurringRevenuePercentage = Math.min(Math.max(recurringRevenueInput || 0, 0.0), 1.0)

  // Handle sole trader vs company
  const numberOfEmployees =
    formData.business_type === 'sole-trader' ? undefined : formData.number_of_employees
  const numberOfOwners =
    formData.business_type === 'sole-trader' ? undefined : formData.number_of_owners || 1

  // Build business context from internal metadata + adaptive input fields
  const fd = formData as any
  const adaptiveFields: Record<string, unknown> = {}
  if (fd.dcf_revenue_growth_pct != null) adaptiveFields.dcf_revenue_growth_pct = fd.dcf_revenue_growth_pct
  if (fd.dcf_ebitda_margin_pct != null) adaptiveFields.dcf_ebitda_margin_pct = fd.dcf_ebitda_margin_pct
  if (fd.dcf_capex_pct != null) adaptiveFields.dcf_capex_pct = fd.dcf_capex_pct
  if (fd.dcf_wacc_pct != null) adaptiveFields.dcf_wacc_pct = fd.dcf_wacc_pct
  if (fd.dcf_terminal_growth_pct != null) adaptiveFields.dcf_terminal_growth_pct = fd.dcf_terminal_growth_pct
  if (fd.nav_real_estate_adjustment != null) adaptiveFields.nav_real_estate_adjustment = fd.nav_real_estate_adjustment
  if (fd.nav_inventory_adjustment != null) adaptiveFields.nav_inventory_adjustment = fd.nav_inventory_adjustment
  if (fd.nav_hidden_reserves != null) adaptiveFields.nav_hidden_reserves = fd.nav_hidden_reserves
  if (fd.nav_goodwill_writeoff != null) adaptiveFields.nav_goodwill_writeoff = fd.nav_goodwill_writeoff
  if (fd.saas_arr != null) adaptiveFields.saas_arr = fd.saas_arr
  if (fd.saas_mrr != null) adaptiveFields.saas_mrr = fd.saas_mrr
  if (fd.saas_arr_growth_pct != null) adaptiveFields.saas_arr_growth_pct = fd.saas_arr_growth_pct
  if (fd.saas_churn_pct != null) adaptiveFields.saas_churn_pct = fd.saas_churn_pct
  if (fd.saas_customer_churn_pct != null) adaptiveFields.saas_customer_churn_pct = fd.saas_customer_churn_pct
  if (fd.saas_nrr_pct != null) adaptiveFields.saas_nrr_pct = fd.saas_nrr_pct
  if (fd.saas_gross_margin_pct != null) adaptiveFields.saas_gross_margin_pct = fd.saas_gross_margin_pct
  if (fd.saas_cac != null) adaptiveFields.saas_cac = fd.saas_cac
  if (fd.saas_customer_concentration_pct != null) adaptiveFields.saas_customer_concentration_pct = fd.saas_customer_concentration_pct
  if (fd.saas_expansion_revenue_pct != null) adaptiveFields.saas_expansion_revenue_pct = fd.saas_expansion_revenue_pct
  if (fd.saas_sm_spend != null) adaptiveFields.saas_sm_spend = fd.saas_sm_spend
  if (fd.rev_recurring_pct != null) adaptiveFields.rev_recurring_pct = fd.rev_recurring_pct
  if (fd.rev_top_client_concentration_pct != null) adaptiveFields.rev_top_client_concentration_pct = fd.rev_top_client_concentration_pct
  if (fd.rev_contract_backlog != null) adaptiveFields.rev_contract_backlog = fd.rev_contract_backlog

  const businessContext = formData.business_type_id
    ? {
        dcfPreference: fd._internal_dcf_preference,
        multiplesPreference: fd._internal_multiples_preference,
        ownerDependencyImpact: fd._internal_owner_dependency_impact,
        keyMetrics: fd._internal_key_metrics,
        typicalEmployeeRange: fd._internal_typical_employee_range,
        typicalRevenueRange: fd._internal_typical_revenue_range,
        ...adaptiveFields,
      }
    : Object.keys(adaptiveFields).length > 0
      ? adaptiveFields
      : undefined

  // Build ValuationRequest
  const request: ValuationRequest = {
    company_name: companyName,
    country_code: countryCode,
    industry: industry,
    business_model: businessModel,
    founding_year: foundingYear,
    current_year_data: currentYearData,
    historical_years_data: historicalYearsData,
    forecast_years_data: forecastYearsData,
    number_of_employees: numberOfEmployees,
    number_of_owners: numberOfOwners,
    recurring_revenue_percentage: recurringRevenuePercentage,
    use_dcf: true,
    use_multiples: true,
    projection_years: 10,
    comparables: formData.comparables || [],
    business_type_id: formData.business_type_id,
    business_type: formData.business_type,
    shares_for_sale: 100,
    business_context: businessContext,
    ...(locale && { locale }),
  }

  // Tax latencies (belastinglatenties) — equity bridge adjustments
  const taxLatencyItems = useTaxLatencyStore.getState().items
  if (taxLatencyItems.length > 0) {
    request.tax_latencies = taxLatencyItems.map((item) => ({
      type: item.type,
      description: item.description,
      temporary_difference: Math.abs(item.temporaryDifference),
      tax_rate: item.taxRate,
    }))
  }

  // BANK-GRADE: Log request structure for diagnostics (only in development)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    generalLogger.debug('buildValuationRequest: Request structure', {
      company_name: request.company_name,
      industry: request.industry,
      business_model: request.business_model,
      business_type_id: request.business_type_id,
      has_current_year_data: !!request.current_year_data,
      current_year_revenue: request.current_year_data?.revenue,
      current_year_ebitda: request.current_year_data?.ebitda,
      has_historical_data: !!request.historical_years_data?.length,
      number_of_employees: request.number_of_employees,
      number_of_owners: request.number_of_owners,
    })
  }

  return request
}
