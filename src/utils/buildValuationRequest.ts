/**
 * Build Valuation Request
 *
 * Single Responsibility: Build ValuationRequest from formData or DataResponse[]
 * Unified function used by both manual and conversational flows
 *
 * @module utils/buildValuationRequest
 */

import { useNormalizationStore } from '../store/useNormalizationStore'
import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'
import type { DataResponse } from '../types/data-collection'
import type { ValuationFormData, ValuationRequest } from '../types/valuation'
import { convertDataResponsesToFormData } from './dataCollectionUtils'
import { generalLogger } from './logger'

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
 * @returns ValuationRequest ready for calculateValuation()
 */
export function buildValuationRequest(
  source: ValuationFormData | DataResponse[],
  overrideItems?: NormalizationItem[]
): ValuationRequest {
  // Convert DataResponse[] to formData if needed
  let formData: ValuationFormData
  if (Array.isArray(source)) {
    formData = convertDataResponsesToFormData(source) as ValuationFormData
  } else {
    formData = source
  }

  // Normalize last full year (2000-2100)
  // Valuations use the most recent completed fiscal year, not the current calendar year
  // ALWAYS calculate from current date, never trust formData to fix year 2026 bug
  const lastFullYear = Math.min(Math.max(new Date().getFullYear() - 1, 2000), 2100)

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

  // Normalize financial data
  const revenue = Math.max(
    Number(formData.revenue) || formData.current_year_data?.revenue || 100000,
    1
  )
  const ebitda =
    formData.ebitda !== undefined && formData.ebitda !== null
      ? Number(formData.ebitda)
      : formData.current_year_data?.ebitda !== undefined &&
          formData.current_year_data?.ebitda !== null
        ? Number(formData.current_year_data.ebitda)
        : 20000

  // Use provided items or read from store — avoids redundant getState() in recalculation paths
  const allItems = overrideItems ?? useNormalizationStore.getState().items
  const acceptedNorms = allItems.filter((n) => n.status === 'accepted')

  // Collect all years that have financial data (current + historical)
  const historicalYears =
    formData.historical_years_data
      ?.filter((y) => y.ebitda != null && y.year >= 2000 && y.year <= 2100)
      .map((y) => y.year) ?? []
  const allDataYears = Array.from(new Set([lastFullYear, ...historicalYears]))

  // Build year-keyed normalization lookup from accepted items
  // CRITICAL: Respect applyAllYears and applyYears — items can apply to multiple years
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
      normByYear[y].totalAdjustment += Number(n.adjustment)
      normByYear[y].count++
      if (n.confidence === 'high') normByYear[y].confidence = 'high'
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
    ...(formData.current_year_data?.total_assets &&
      formData.current_year_data.total_assets >= 0 && {
        total_assets: Number(formData.current_year_data.total_assets),
      }),
    ...(formData.current_year_data?.total_debt &&
      formData.current_year_data.total_debt >= 0 && {
        total_debt: Number(formData.current_year_data.total_debt),
      }),
    ...(formData.current_year_data?.cash &&
      formData.current_year_data.cash >= 0 && {
        cash: Number(formData.current_year_data.cash),
      }),
  }

  // Normalize historical data (filter and sort) with normalization support
  const historicalYearsData =
    formData.historical_years_data
      ?.filter(
        (year) =>
          year.ebitda !== undefined &&
          year.ebitda !== null &&
          year.year >= 2000 &&
          year.year <= 2100
      )
      .map((year) => {
        const normalization = normByYear[year.year]

        // If normalization exists, use normalized EBITDA
        if (normalization) {
          const reportedEbitda = Number(year.ebitda)
          return {
            year: Math.min(Math.max(year.year, 2000), 2100),
            revenue: Math.max(year.revenue || 0, 1),
            ebitda: reportedEbitda + normalization.totalAdjustment,
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

        // No normalization, use reported EBITDA
        return {
          year: Math.min(Math.max(year.year, 2000), 2100),
          revenue: Math.max(year.revenue || 0, 1),
          ebitda: Number(year.ebitda),
          ebitda_normalized: false,
        }
      })
      .sort((a, b) => a.year - b.year) || []

  // Normalize recurring revenue percentage (0.0-1.0)
  const recurringRevenuePercentage = Math.min(
    Math.max(formData.recurring_revenue_percentage || 0, 0.0),
    1.0
  )

  // Handle sole trader vs company
  const numberOfEmployees =
    formData.business_type === 'sole-trader' ? undefined : formData.number_of_employees
  const numberOfOwners =
    formData.business_type === 'sole-trader' ? undefined : formData.number_of_owners || 1

  // Build business context from internal metadata
  const businessContext = formData.business_type_id
    ? {
        dcfPreference: (formData as any)._internal_dcf_preference,
        multiplesPreference: (formData as any)._internal_multiples_preference,
        ownerDependencyImpact: (formData as any)._internal_owner_dependency_impact,
        keyMetrics: (formData as any)._internal_key_metrics,
        typicalEmployeeRange: (formData as any)._internal_typical_employee_range,
        typicalRevenueRange: (formData as any)._internal_typical_revenue_range,
      }
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
    number_of_employees: numberOfEmployees,
    number_of_owners: numberOfOwners,
    recurring_revenue_percentage: recurringRevenuePercentage,
    use_dcf: true,
    use_multiples: true,
    projection_years: 10,
    comparables: formData.comparables || [],
    business_type_id: formData.business_type_id,
    business_type: formData.business_type,
    shares_for_sale: formData.shares_for_sale || 100,
    business_context: businessContext,
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
