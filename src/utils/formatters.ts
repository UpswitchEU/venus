/**
 * Formatting Utilities
 *
 * Utilities for formatting currency, numbers, and version labels
 *
 * @module utils/formatters
 */

import type { ValuationVersion } from '../types/ValuationVersion'

/**
 * Format currency with M/K suffixes
 * @example formatCurrency(2400000) => "€2.4M"
 * @example formatCurrency(450000) => "€450K"
 * @example formatCurrency(5000) => "€5K"
 * @example formatCurrency(undefined) => "N/A"
 */
export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'N/A'
  }

  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(1)}M`
  } else if (value >= 1000) {
    return `€${(value / 1000).toFixed(0)}K`
  }
  return `€${value.toFixed(0)}`
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

  // Check if we have the required valuation values
  const hasLow = result.equity_value_low !== undefined && result.equity_value_low !== null
  const hasHigh = result.equity_value_high !== undefined && result.equity_value_high !== null
  const hasAsking =
    result.recommended_asking_price !== undefined && result.recommended_asking_price !== null

  // If we don't have all values, show pending
  if (!hasLow || !hasHigh || !hasAsking) {
    return 'Pending calculation'
  }

  const low = formatCurrency(result.equity_value_low)
  const high = formatCurrency(result.equity_value_high)
  const asking = formatCurrency(result.recommended_asking_price)

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

  return `${low} - ${high} (Ask: ${asking})${normalizationIndicator}`
}
