import type { SaveSessionUpdates } from '../../../services/session/SessionSaveService'
import type { ValuationFormData } from '../../../types/valuation'
import {
  currentYearFinancialNumberOrZero,
  resolveCurrentYearFinancialBasis,
} from '../../../utils/currentYearFinancialBasis'
import {
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../../../utils/fiscalYear'
import { isSessionKey, isUuid } from '../../../utils/identifiers'
import { validateBusinessTypeSelection } from '../../../utils/validateBusinessTypeSelection'

export const EMPLOYEE_COUNT_REQUIRED_MESSAGE =
  'Employee count is required when owner count is provided to calculate owner concentration risk. Enter 0 if there are no employees besides the owner-managers.'

export type ValuationFormSubmissionValidation =
  | { ok: true }
  | {
      ok: false
      reason: 'employee_count_required' | 'business_type_mismatch' | 'missing_required_fields'
      message: string
      missingFields?: string[]
    }

export interface CalculationRequestIdentifiers {
  reportId?: string
  sessionKey?: string
}

export function validateValuationFormSubmission(
  formData: ValuationFormData
): ValuationFormSubmissionValidation {
  if (
    formData.business_type === 'company' &&
    formData.number_of_owners &&
    formData.number_of_owners > 0 &&
    formData.number_of_employees === undefined
  ) {
    return {
      ok: false,
      reason: 'employee_count_required',
      message: EMPLOYEE_COUNT_REQUIRED_MESSAGE,
    }
  }

  if (formData.business_type_id) {
    const businessTypeMismatch = validateBusinessTypeSelection({
      businessTypeId: formData.business_type_id,
      businessTypeTitle: formData.business_type_title ?? null,
      industry: formData.industry,
    })
    if (businessTypeMismatch) {
      return {
        ok: false,
        reason: 'business_type_mismatch',
        message: businessTypeMismatch,
      }
    }
  }

  const missingFields = []
  if (formData.revenue == null) missingFields.push('revenue')
  if (formData.ebitda == null) missingFields.push('ebitda')
  if (!formData.industry) missingFields.push('industry')
  if (!formData.country_code) missingFields.push('country_code')
  if (!formData.business_type_id) missingFields.push('business_type_id')

  if (missingFields.length > 0) {
    return {
      ok: false,
      reason: 'missing_required_fields',
      message: `Please fill in all required fields: ${missingFields.join(', ')}`,
      missingFields,
    }
  }

  return { ok: true }
}

export function buildPreCalculationSessionUpdate(
  formData: ValuationFormData,
  now: Date = new Date()
): SaveSessionUpdates {
  const currentYear = normalizeCurrentYearForFiling(
    formData.current_year_data?.year,
    formData.filing_year_confirmed,
    now
  )
  const normalizedHistoricalYears = normalizeHistoricalYearsForFiling(
    formData.historical_years_data,
    formData.filing_year_confirmed,
    now
  )
  const currentYearFinancials = resolveCurrentYearFinancialBasis({
    currentFiscalYear: currentYear,
    currentYearData: formData.current_year_data,
    topLevelRevenue: formData.revenue,
    topLevelEbitda: formData.ebitda,
  })

  return {
    ...formData,
    company_name: formData.company_name,
    country_code: formData.country_code,
    industry: formData.industry,
    business_model: formData.business_model,
    founding_year: formData.founding_year,
    current_year_data: {
      ...formData.current_year_data,
      year: currentYear,
      revenue: currentYearFinancialNumberOrZero(currentYearFinancials.revenueInput),
      ebitda: currentYearFinancialNumberOrZero(currentYearFinancials.ebitdaInput),
    },
    historical_years_data: normalizedHistoricalYears,
    number_of_employees: formData.number_of_employees,
    number_of_owners: formData.number_of_owners,
    recurring_revenue_percentage: formData.recurring_revenue_percentage,
    comparables: formData.comparables,
    business_type_id: formData.business_type_id,
    business_type_segments: formData.business_type_segments,
    business_type: formData.business_type,
    shares_for_sale: formData.shares_for_sale ?? 100,
    business_context: formData.business_context,
  }
}

export function buildCalculationRequestIdentifiers(
  reportId: string | undefined
): CalculationRequestIdentifiers {
  const validReportId =
    reportId && (isUuid(reportId) || isSessionKey(reportId)) ? reportId : undefined
  return {
    reportId: validReportId,
    sessionKey: reportId && isSessionKey(reportId) ? reportId : undefined,
  }
}
