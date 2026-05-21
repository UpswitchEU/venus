/**
 * Safe Number Conversion Utilities
 *
 * Provides type-safe number conversion with proper handling of edge cases:
 * - NaN values
 * - Null/undefined values
 * - Empty strings
 * - Invalid inputs
 *
 * @author UpSwitch CTO Team
 * @version 1.0.0
 */

/**
 * Safely convert a value to a number, returning undefined for invalid inputs.
 *
 * Handles edge cases:
 * - undefined → undefined
 * - null → undefined
 * - empty string → undefined
 * - NaN → undefined
 * - Valid numbers → number
 * - Valid numeric strings → number
 *
 * @param value - Value to convert (any type)
 * @returns Number or undefined if conversion is invalid
 *
 * @example
 * safeNumber("0.40") // → 0.4
 * safeNumber("invalid") // → undefined
 * safeNumber(null) // → undefined
 * safeNumber("") // → undefined
 * safeNumber(undefined) // → undefined
 */
export const safeNumber = (value: unknown): number | undefined => {
  // Handle undefined and null
  if (value === undefined || value === null) {
    return undefined
  }

  // Handle empty string
  if (value === '') {
    return undefined
  }

  // Convert to number
  const num = Number(value)

  // Return undefined if NaN (invalid conversion)
  if (isNaN(num)) {
    return undefined
  }

  return num
}

/**
 * Validate that a preference value is in the valid range (0-1).
 *
 * @param value - Number to validate
 * @returns Number if valid, undefined if out of range
 *
 * @example
 * validatePreference(0.5) // → 0.5
 * validatePreference(1.5) // → undefined (out of range)
 * validatePreference(-0.1) // → undefined (out of range)
 */
export const validatePreference = (value: number | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }

  // Validate range (0-1)
  if (value < 0 || value > 1) {
    console.warn(`[VALIDATION] Preference out of range: ${value}, expected 0-1`)
    return undefined
  }

  return value
}

/**
 * Safely convert and validate a preference value.
 * Combines safeNumber() and validatePreference() for convenience.
 *
 * @param value - Value to convert and validate
 * @returns Number (0-1) or undefined if invalid
 *
 * @example
 * safePreference("0.40") // → 0.4
 * safePreference("1.5") // → undefined (out of range)
 * safePreference("invalid") // → undefined (invalid)
 */
export const safePreference = (value: unknown): number | undefined => {
  const num = safeNumber(value)
  return validatePreference(num)
}
