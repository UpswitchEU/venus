/**
 * Data Collection Adapter
 *
 * Single Responsibility: Convert StreamingChat collected data to DataResponse format
 * SOLID Principles: SRP - Only handles data format conversion
 *
 * Unifies conversational flow data collection with manual flow data structure.
 * Ensures both flows use the same DataResponse[] format for the form store.
 *
 * @module utils/dataCollectionAdapter
 */

import type { DataCollectionMethod, DataResponse, FieldValue } from '../types/data-collection'

/**
 * Convert StreamingChat collected data to DataResponse[] format
 *
 * This adapter bridges the gap between StreamingChat's internal data format
 * and the unified DataResponse format used by the form store.
 *
 * @param collectedData - StreamingChat's collected data
 * @param method - Collection method (default: 'conversational')
 * @returns Array of DataResponse objects ready for form store
 */
export function convertCollectedDataToDataResponses(
  collectedData: Record<string, unknown>,
  method: DataCollectionMethod = 'conversational'
): DataResponse[] {
  const responses: DataResponse[] = []

  Object.entries(collectedData).forEach(([fieldId, value]) => {
    // Skip undefined/null values
    if (value === undefined || value === null) {
      return
    }

    // Extract metadata from value if it's an object with metadata
    let actualValue: FieldValue = value as FieldValue
    let confidence = 0.9 // Default confidence for conversational data
    let source = 'ai_extraction'
    let metadata: Record<string, unknown> | undefined

    // Handle value objects that might contain metadata
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      const valueRecord = value as Record<string, unknown>
      // Check if it's a structured data object
      if ('value' in valueRecord) {
        actualValue = valueRecord.value as FieldValue
        confidence =
          typeof valueRecord.confidence === 'number' ? valueRecord.confidence : confidence
        source = typeof valueRecord.source === 'string' ? valueRecord.source : source
        metadata =
          valueRecord.metadata && typeof valueRecord.metadata === 'object'
            ? (valueRecord.metadata as Record<string, unknown>)
            : undefined
      } else {
        // If it's a plain object, use it as-is but mark as object type
        actualValue = value as unknown as FieldValue
        source = 'structured_data'
      }
    } else {
      // Simple value - use as-is
      actualValue = value as FieldValue
    }

    // Normalize value type based on field ID patterns
    const normalizedValue = normalizeFieldValue(fieldId, actualValue)

    const response: DataResponse = {
      fieldId,
      value: normalizedValue,
      method,
      confidence,
      source,
      timestamp: new Date(),
      metadata,
    }

    responses.push(response)
  })

  return responses
}

/**
 * Convert single data point from StreamingChat callback to DataResponse
 *
 * Used when StreamingChat calls onDataCollected with { field, value } format
 *
 * @param data - Data point from StreamingChat onDataCollected callback
 * @param method - Collection method (default: 'conversational')
 * @returns DataResponse object ready for form store
 */
export function convertDataPointToDataResponse(
  data: { field: string; value: unknown; confidence?: number; source?: string },
  method: DataCollectionMethod = 'conversational'
): DataResponse {
  const normalizedValue = normalizeFieldValue(data.field, data.value as FieldValue)

  return {
    fieldId: data.field,
    value: normalizedValue,
    method,
    confidence: data.confidence ?? 0.9,
    source: data.source ?? 'ai_extraction',
    timestamp: new Date(),
  }
}

/**
 * Normalize field value based on field ID patterns
 *
 * Handles type conversions (string → number, etc.) based on field naming conventions
 *
 * @param fieldId - Field identifier
 * @param value - Raw value to normalize
 * @returns Normalized value
 */
function normalizeFieldValue(fieldId: string, value: FieldValue): FieldValue {
  if (value === null || value === undefined) {
    return value
  }

  // Numeric fields - convert strings to numbers
  const numericFields = [
    'revenue',
    'ebitda',
    'number_of_employees',
    'founding_year',
    'employees',
    'employee_count',
  ]

  if (numericFields.includes(fieldId)) {
    if (typeof value === 'string') {
      // Remove currency symbols, commas, etc.
      const cleaned = value.replace(/[€£$,\s]/g, '').trim()

      // Handle "million", "M", "K" suffixes
      if (cleaned.toLowerCase().includes('million') || cleaned.toLowerCase().includes('m')) {
        const baseValue = parseFloat(cleaned.replace(/million|m/gi, ''))
        return isNaN(baseValue) ? value : baseValue * 1000000
      }

      if (cleaned.toLowerCase().includes('k')) {
        const baseValue = parseFloat(cleaned.replace(/k/gi, ''))
        return isNaN(baseValue) ? value : baseValue * 1000
      }

      const numValue = parseFloat(cleaned)
      return isNaN(numValue) ? value : numValue
    }

    // Already a number
    if (typeof value === 'number') {
      return value
    }
  }

  // Boolean fields
  const booleanFields = ['has_historical_data', 'is_profitable', 'is_profitable']

  if (booleanFields.includes(fieldId)) {
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim()
      return lower === 'true' || lower === 'yes' || lower === '1'
    }
    return Boolean(value)
  }

  // String fields - ensure string type
  const stringFields = ['company_name', 'country_code', 'industry', 'business_model', 'legal_form']

  if (stringFields.includes(fieldId)) {
    return String(value)
  }

  // Default: return as-is
  return value
}

/**
 * Merge new data response into existing DataResponse array
 *
 * Updates existing response if fieldId exists, otherwise adds new response
 *
 * @param existingResponses - Current DataResponse array
 * @param newResponse - New DataResponse to merge
 * @returns Updated DataResponse array
 */
export function mergeDataResponse(
  existingResponses: DataResponse[],
  newResponse: DataResponse
): DataResponse[] {
  // Remove existing response for same field
  const filtered = existingResponses.filter((r) => r.fieldId !== newResponse.fieldId)

  // Add new response
  return [...filtered, newResponse]
}
