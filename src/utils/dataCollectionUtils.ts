/**
 * Data Collection Utilities
 *
 * Shared utility functions for data collection operations.
 * Used by both manual and conversational flows to ensure consistency.
 */

import type { DataResponse } from '../types/data-collection'
import type { ValuationFormData } from '../types/valuation'
import { parseEmployeeCount } from './employeeCount'

/**
 * Convert DataResponse array to ValuationFormData format
 * Shared utility used by both manual and conversational flows
 *
 * @param responses - Array of DataResponse objects from data collection
 * @returns Partial ValuationFormData object ready for valuation store
 */
export function convertDataResponsesToFormData(
  responses: DataResponse[]
): Partial<ValuationFormData> {
  const formData: Partial<ValuationFormData> = {}

  responses.forEach((response) => {
    const fieldId = response.fieldId
    let value = response.value

    // Handle type conversions based on field type
    // Map common field IDs to ValuationFormData properties
    switch (fieldId) {
      case 'number_of_employees':
        value = parseEmployeeCount(value) ?? value
        break

      case 'revenue':
      case 'ebitda':
      case 'founding_year':
        // Convert to number if it's a string
        if (typeof value === 'string') {
          const numValue = parseFloat(value.replace(/[^\d.-]/g, ''))
          value = isNaN(numValue) ? value : numValue
        }
        break

      case 'country_code':
      case 'industry':
      case 'company_name':
      case 'legal_form':
        // Ensure string type
        value = String(value)
        break

      case 'has_historical_data':
      case 'is_profitable':
        // Convert to boolean
        if (typeof value === 'string') {
          value = value.toLowerCase() === 'true' || value.toLowerCase() === 'yes'
        }
        break

      default:
        // For other fields, use value as-is
        break
    }

    // Map field ID to ValuationFormData property
    // This handles the mapping between data collection field IDs and form data properties
    // Type assertion is safe here as we're mapping known field IDs to known form data properties
    const key = fieldId as keyof ValuationFormData
    if (key in formData || value !== undefined) {
      ;(formData as Record<string, unknown>)[fieldId] = value
    }
  })

  return formData
}
