/**
 * Formatting Utilities
 *
 * Utilities for formatting currency, numbers, and version labels.
 * Updated to support bank-grade decimal precision from API.
 *
 * @module utils/formatters
 */

import type { User } from '../contexts/AuthContextTypes'
import type { ValuationVersion } from '../types/ValuationVersion'
import { type DecimalInput, parseDecimal, toNumber } from './decimal'
import {
  getEquityValueHigh,
  getEquityValueLow,
  getEquityValueMid,
  getRecommendedAskingPrice,
} from './valuationResultAccess'

/**
 * Input type for formatting functions.
 * Supports both new string format (bank-grade precision) and legacy number format.
 */
export type FormattableValue = DecimalInput

/**
 * Format currency with M/K suffixes
 * Supports both string (new API format) and number (legacy format) inputs.
 *
 * @param value - The value to format (string, number, Decimal, null, or undefined)
 * @returns Formatted currency string
 *
 * @example
 * formatCurrency("2400000")    // "€2.4M"
 * formatCurrency(2400000)      // "€2.4M"
 * formatCurrency("450000")     // "€450K"
 * formatCurrency("5000")       // "€5K"
 * formatCurrency(undefined)    // "N/A"
 */
export function formatCurrency(value: FormattableValue): string {
  if (value === undefined || value === null) {
    return 'N/A'
  }

  // Parse to Decimal for precision, then convert to number for formatting
  const decimal = parseDecimal(value)
  const numValue = toNumber(decimal)

  // Check for NaN
  if (Number.isNaN(numValue)) {
    return 'N/A'
  }

  if (numValue >= 1000000) {
    return `€${(numValue / 1000000).toFixed(1)}M`
  }
  if (numValue >= 1000) {
    return `€${(numValue / 1000).toFixed(0)}K`
  }
  return `€${numValue.toFixed(0)}`
}

/**
 * Format a value as percentage
 * Supports both string (new API format) and number (legacy format) inputs.
 *
 * @param value - The value (0-1 or 0-100, as string or number)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 *
 * @example
 * formatPercentage("0.85")     // "85.0%"
 * formatPercentage(0.85)       // "85.0%"
 * formatPercentage("85")       // "85.0%"
 * formatPercentage(null)       // "0%"
 */
export function formatPercentage(value: FormattableValue, decimals = 1): string {
  if (value === undefined || value === null) {
    return '0%'
  }

  // Parse to Decimal for precision, then convert to number
  const decimal = parseDecimal(value)
  const numValue = toNumber(decimal)

  // If value is between -1 and 1, assume it's a decimal (0.85 = 85%)
  const percentValue = numValue >= -1 && numValue <= 1 ? numValue * 100 : numValue
  return `${percentValue.toFixed(decimals)}%`
}

/**
 * Format a shareholding percentage with fixed two-decimal precision.
 */
export function formatShareholdingPercentage(value: FormattableValue): string {
  return formatPercentage(value, 2)
}

/**
 * Format a value with thousand separators
 * Supports both string (new API format) and number (legacy format) inputs.
 *
 * @param value - The value to format (string, number, Decimal, null, or undefined)
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted number string
 *
 * @example
 * formatNumber("1234567.89")   // "1.234.568"
 * formatNumber(1234567.89)     // "1.234.568"
 * formatNumber("1234567.89", 2) // "1.234.567,89"
 */
export function formatNumber(value: FormattableValue, decimals = 0): string {
  if (value === undefined || value === null) {
    return '0'
  }

  // Parse to Decimal for precision, then convert to number for formatting
  const decimal = parseDecimal(value)
  const numValue = toNumber(decimal)

  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue)
}

/**
 * Format version dropdown label with valuation values and normalization indicator
 * Format: "€2.4M - €3.8M (Ask: €3.4M) [Normalized]" or "Pending calculation"
 *
 * @param version - Valuation version with optional valuationResult
 * @returns Formatted label for version dropdown
 */
export function formatVersionLabel(version: ValuationVersion): string {
  const result = version.valuationResult

  if (!result) {
    return 'Pending calculation'
  }

  const low = getEquityValueLow(result)
  const high = getEquityValueHigh(result)
  const asking = getRecommendedAskingPrice(result) ?? getEquityValueMid(result)

  if (low == null || high == null || high <= 0 || asking == null || asking <= 0) {
    return 'Pending calculation'
  }

  const lowLabel = formatCurrency(low)
  const highLabel = formatCurrency(high)
  const askingLabel = formatCurrency(asking)

  // Check if version has normalized EBITDA
  const hasNormalizedEbitda =
    version.changeMetadata?.normalized_years &&
    Array.isArray(version.changeMetadata.normalized_years) &&
    version.changeMetadata.normalized_years.length > 0
  const normalizedYearsCount =
    hasNormalizedEbitda && version.changeMetadata?.normalized_years
      ? version.changeMetadata.normalized_years.length
      : 0

  // Add normalization indicator if present
  const normalizationIndicator = hasNormalizedEbitda
    ? ` [Normalized: ${normalizedYearsCount}yr${normalizedYearsCount > 1 ? 's' : ''}]`
    : ''

  return `${lowLabel} - ${highLabel} (Ask: ${askingLabel})${normalizationIndicator}`
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(str: string | null | undefined): boolean {
  return !!str && UUID_REGEX.test(str)
}

/**
 * Format version author for display.
 * Shows user name/email instead of raw user ID when possible.
 *
 * @param createdBy - User ID from version (or 'guest', null)
 * @param currentUser - Current authenticated user (for matching)
 * @param fallbacks - Translated fallbacks for generic user/guest
 * @returns Display string: name, email, "User", or "Guest"
 */
export function formatVersionAuthor(
  createdBy: string | null | undefined,
  currentUser: User | null,
  fallbacks: { user?: string; guest?: string } = {}
): string {
  const { user: userFallback = 'User', guest: guestFallback = 'Guest' } = fallbacks

  if (!createdBy || createdBy === 'guest' || createdBy.trim() === '') {
    return guestFallback
  }

  if (currentUser && createdBy === currentUser.id) {
    return currentUser.name?.trim() || currentUser.email || userFallback
  }

  if (isUuid(createdBy)) {
    return userFallback
  }

  if (createdBy.includes('@')) {
    return createdBy
  }

  return userFallback
}
