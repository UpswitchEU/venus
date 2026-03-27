/**
 * Convert Form Data to DataResponse Array
 *
 * Single Responsibility: Convert ValuationFormData to DataResponse[] format
 * Used to integrate ValuationForm with unified data collection pipeline
 *
 * @module components/ValuationForm/utils/convertFormDataToDataResponses
 */

import type { DataResponse } from '../../../types/data-collection'
import type { ValuationFormData } from '../../../types/valuation'
import { normalizeCurrentYearForFiling } from '../../../utils/fiscalYear'

/**
 * Convert ValuationFormData to DataResponse[] format
 *
 * Maps form data fields to DataResponse objects for unified data collection pipeline.
 * Both manual and conversational flows use DataResponse[] format.
 *
 * @param formData - Form data from ValuationForm
 * @returns Array of DataResponse objects ready for setCollectedData()
 */
export function convertFormDataToDataResponses(formData: ValuationFormData): DataResponse[] {
  const responses: DataResponse[] = []

  // Helper to add response if value exists
  const addResponse = (fieldId: string, value: unknown, metadata?: Record<string, unknown>) => {
    if (value !== undefined && value !== null && value !== '') {
      responses.push({
        fieldId,
        value: value as string | number | boolean,
        method: 'manual_form',
        confidence: 1.0, // User input = 100% confidence
        source: 'user_input',
        timestamp: new Date(),
        metadata,
      })
    }
  }

  // Basic Information
  addResponse('company_name', formData.company_name)
  addResponse('country_code', formData.country_code)
  addResponse('industry', formData.industry)
  addResponse('business_model', formData.business_model)
  addResponse('founding_year', formData.founding_year)
  addResponse('business_type_id', formData.business_type_id, {
    business_type: formData.business_type,
    subIndustry: formData.subIndustry,
  })

  // Financial Data
  addResponse('revenue', formData.revenue)
  addResponse('ebitda', formData.ebitda)

  // Current Year Data (if structured)
  if (formData.current_year_data) {
    addResponse(
      'current_year',
      normalizeCurrentYearForFiling(
        formData.current_year_data.year,
        Boolean(formData.filing_year_confirmed)
      )
    )
    if (formData.current_year_data.revenue !== undefined) {
      addResponse('revenue', formData.current_year_data.revenue)
    }
    if (formData.current_year_data.ebitda !== undefined) {
      addResponse('ebitda', formData.current_year_data.ebitda)
    }
  }

  // Ownership Structure
  addResponse('business_type', formData.business_type)
  addResponse('number_of_owners', formData.number_of_owners)
  addResponse('number_of_employees', formData.number_of_employees)
  addResponse('shares_for_sale', 100)

  // Historical Data
  if (formData.historical_years_data && formData.historical_years_data.length > 0) {
    formData.historical_years_data.forEach((yearData, index) => {
      addResponse(`historical_year_${yearData.year}`, yearData.year, {
        revenue: yearData.revenue,
        ebitda: yearData.ebitda,
        index,
      })
    })
  }

  // Additional Fields
  addResponse('recurring_revenue_percentage', formData.recurring_revenue_percentage)

  return responses
}
