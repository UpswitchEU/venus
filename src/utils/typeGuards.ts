/**
 * Type Guards
 *
 * Type guard functions for runtime type checking.
 * Replaces unsafe 'as any' type assertions with safe, validated checks.
 *
 * @module utils/typeGuards
 */

import type { ValuationRequest, ValuationResponse } from '../types/valuation'

/**
 * Check if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Check if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Check if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value)
}

/**
 * Check if value is an ApiNumeric (string or number) from the API.
 * The Python backend now sends Decimal values as strings for bank-grade precision.
 */
export function isApiNumeric(value: unknown): value is string | number {
  if (typeof value === 'number' && !isNaN(value)) {
    return true
  }
  if (typeof value === 'string') {
    // Check if it's a valid numeric string
    const parsed = parseFloat(value)
    return !isNaN(parsed)
  }
  return false
}

/**
 * Check if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Check if value is an array
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value)
}

/**
 * Check if value has a specific property
 */
export function hasProperty<K extends string>(
  value: unknown,
  property: K
): value is Record<K, unknown> {
  return isObject(value) && property in value
}

/**
 * Check if value has multiple properties
 */
export function hasProperties<K extends string>(
  value: unknown,
  properties: K[]
): value is Record<K, unknown> {
  return isObject(value) && properties.every((prop) => prop in value)
}

/**
 * Type guard for ValuationRequest
 */
export function isValuationRequest(value: unknown): value is ValuationRequest {
  if (!isObject(value)) return false

  const required = ['company_name', 'country_code', 'industry', 'current_year_data']

  if (!hasProperties(value, required)) return false

  // Validate current_year_data structure
  const currentYearData = value.current_year_data
  if (!isObject(currentYearData)) return false
  if (!hasProperty(currentYearData, 'revenue')) return false
  if (!isNumber(currentYearData.revenue)) return false

  return true
}

/**
 * Type guard for ValuationResponse
 */
export function isValuationResponse(value: unknown): value is ValuationResponse {
  if (!isObject(value)) return false

  const required = ['valuation_id', 'equity_value_mid', 'methodology', 'confidence_score']

  if (!hasProperties(value, required)) return false

  // Validate types
  // BANK-GRADE: Accept both string and number for precision values from API
  if (!isString(value.valuation_id)) return false
  if (!isApiNumeric(value.equity_value_mid)) return false
  if (!isString(value.methodology)) return false
  if (!isApiNumeric(value.confidence_score)) return false

  return true
}

/**
 * Type guard for session data containing pythonSessionId
 */
export function hasPythonSessionId(value: unknown): value is { pythonSessionId: string } {
  return hasProperty(value, 'pythonSessionId') && isString(value.pythonSessionId)
}

/**
 * Type guard for financial data
 */
export function isFinancialData(value: unknown): value is {
  revenue: number
  ebitda?: number
  net_income?: number
} {
  if (!isObject(value)) return false
  if (!hasProperty(value, 'revenue')) return false
  if (!isNumber(value.revenue)) return false

  return true
}

/**
 * Type guard for conversation message
 */
export function isConversationMessage(value: unknown): value is {
  id: string
  role: string
  content: string
  timestamp: string | Date
} {
  if (!isObject(value)) return false

  const required = ['id', 'role', 'content', 'timestamp']
  if (!hasProperties(value, required)) return false

  if (!isString(value.id)) return false
  if (!isString(value.role)) return false
  if (!isString(value.content)) return false

  return true
}

/**
 * Type guard for API error response
 */
export function isAPIErrorResponse(value: unknown): value is {
  error: string
  message: string
  code?: string
  status?: number
} {
  if (!isObject(value)) return false

  if (!hasProperty(value, 'error') || !isString(value.error)) return false
  if (!hasProperty(value, 'message') || !isString(value.message)) return false

  return true
}

/**
 * Type guard for session history response
 */
export function isSessionHistoryResponse(value: unknown): value is {
  exists: boolean
  messages?: any[]
  fields_collected?: number
  completeness_percent?: number
} {
  if (!isObject(value)) return false
  if (!hasProperty(value, 'exists')) return false
  if (!isBoolean(value.exists)) return false

  return true
}

/**
 * Type guard for report section
 */
export function isReportSection(value: unknown): value is {
  id: string
  section: string
  phase: number
  html: string
} {
  if (!isObject(value)) return false

  const required = ['id', 'section', 'phase', 'html']
  if (!hasProperties(value, required)) return false

  if (!isString(value.id)) return false
  if (!isString(value.section)) return false
  if (!isNumber(value.phase)) return false
  if (!isString(value.html)) return false

  return true
}

/**
 * Safe property accessor with type guard
 *
 * Usage:
 * ```tsx
 * const value = safeGet(obj, 'propertyName', isString);
 * // value is string | undefined
 * ```
 */
export function safeGet<T>(
  obj: unknown,
  property: string,
  typeGuard: (value: unknown) => value is T
): T | undefined {
  if (!hasProperty(obj, property)) return undefined
  const value = obj[property]
  return typeGuard(value) ? value : undefined
}

/**
 * Safe array access with type guard
 *
 * Usage:
 * ```tsx
 * const items = safeArray(value, isString);
 * // items is string[]
 * ```
 */
export function safeArray<T>(value: unknown, itemGuard: (item: unknown) => item is T): T[] {
  if (!isArray(value)) return []
  return value.filter(itemGuard)
}

/**
 * Narrow unknown to specific type with validation
 *
 * Usage:
 * ```tsx
 * const validated = narrow(unknownValue, isValuationResponse);
 * if (validated) {
 *   // validated is ValuationResponse
 * }
 * ```
 */
export function narrow<T>(value: unknown, typeGuard: (value: unknown) => value is T): T | null {
  return typeGuard(value) ? value : null
}
