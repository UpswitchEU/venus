/**
 * Decimal Utilities for Bank-Grade Precision
 *
 * This module provides utilities for handling decimal values from the API,
 * which are serialized as strings to preserve full precision.
 *
 * The Python backend sends Decimal values as strings (e.g., "1234567.89")
 * to avoid floating-point precision loss. This module uses decimal.js
 * to maintain that precision throughout the frontend.
 *
 * @module utils/decimal
 */

import Decimal from 'decimal.js'

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 20, // 20 significant digits
  rounding: Decimal.ROUND_HALF_UP, // Standard financial rounding
  toExpNeg: -9, // Don't use exponential notation for small numbers
  toExpPos: 21, // Don't use exponential notation for large numbers
})

/**
 * Type for values that can be parsed as decimals.
 * Supports both new string format and legacy number format.
 */
export type DecimalInput = string | number | Decimal | null | undefined

/**
 * Parse a value from the API into a Decimal.
 * Handles both string (new format) and number (legacy format) inputs.
 *
 * @param value - The value to parse (string, number, Decimal, null, or undefined)
 * @returns A Decimal instance, or Decimal(0) if input is null/undefined/invalid
 *
 * @example
 * parseDecimal("1234567.89")  // Decimal("1234567.89")
 * parseDecimal(1234567.89)    // Decimal("1234567.89")
 * parseDecimal(null)          // Decimal("0")
 * parseDecimal(undefined)     // Decimal("0")
 */
export function parseDecimal(value: DecimalInput): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0)
  }

  if (value instanceof Decimal) {
    return value
  }

  try {
    // Handle string or number input
    const decimal = new Decimal(value)

    // Check for NaN or Infinity
    if (!decimal.isFinite()) {
      console.warn(`[decimal] Non-finite value detected: ${value}, defaulting to 0`)
      return new Decimal(0)
    }

    return decimal
  } catch (error) {
    console.warn(`[decimal] Failed to parse value: ${value}, defaulting to 0`)
    return new Decimal(0)
  }
}

/**
 * Check if a value is a valid decimal input (not null/undefined/NaN).
 *
 * @param value - The value to check
 * @returns true if the value can be parsed as a valid decimal
 */
export function isValidDecimal(value: DecimalInput): boolean {
  if (value === null || value === undefined) {
    return false
  }

  if (value instanceof Decimal) {
    return value.isFinite()
  }

  try {
    const decimal = new Decimal(value)
    return decimal.isFinite()
  } catch {
    return false
  }
}

/**
 * Convert a Decimal to a display string with specified decimal places.
 *
 * @param value - The Decimal value to format
 * @param decimalPlaces - Number of decimal places (default: 2)
 * @returns Formatted string representation
 *
 * @example
 * toDisplayString(new Decimal("1234567.89"))     // "1234567.89"
 * toDisplayString(new Decimal("1234567.8"), 2)   // "1234567.80"
 * toDisplayString(new Decimal("1234567.899"), 2) // "1234567.90"
 */
export function toDisplayString(value: Decimal | DecimalInput, decimalPlaces = 2): string {
  const decimal = value instanceof Decimal ? value : parseDecimal(value)
  return decimal.toFixed(decimalPlaces)
}

/**
 * Convert a Decimal to a number.
 *
 * WARNING: This may lose precision for very large or very precise values.
 * Use only when a number type is absolutely required (e.g., for charting libraries).
 *
 * @param value - The Decimal value to convert
 * @returns The numeric representation
 */
export function toNumber(value: Decimal | DecimalInput): number {
  const decimal = value instanceof Decimal ? value : parseDecimal(value)
  return decimal.toNumber()
}

/**
 * Add two decimal values.
 *
 * @param a - First value
 * @param b - Second value
 * @returns Sum as Decimal
 */
export function add(a: DecimalInput, b: DecimalInput): Decimal {
  return parseDecimal(a).plus(parseDecimal(b))
}

/**
 * Subtract two decimal values (a - b).
 *
 * @param a - Value to subtract from
 * @param b - Value to subtract
 * @returns Difference as Decimal
 */
export function subtract(a: DecimalInput, b: DecimalInput): Decimal {
  return parseDecimal(a).minus(parseDecimal(b))
}

/**
 * Multiply two decimal values.
 *
 * @param a - First value
 * @param b - Second value
 * @returns Product as Decimal
 */
export function multiply(a: DecimalInput, b: DecimalInput): Decimal {
  return parseDecimal(a).times(parseDecimal(b))
}

/**
 * Divide two decimal values (a / b).
 *
 * @param a - Dividend
 * @param b - Divisor
 * @returns Quotient as Decimal, or Decimal(0) if divisor is 0
 */
export function divide(a: DecimalInput, b: DecimalInput): Decimal {
  const divisor = parseDecimal(b)
  if (divisor.isZero()) {
    console.warn('[decimal] Division by zero, returning 0')
    return new Decimal(0)
  }
  return parseDecimal(a).dividedBy(divisor)
}

/**
 * Compare two decimal values.
 *
 * @param a - First value
 * @param b - Second value
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compare(a: DecimalInput, b: DecimalInput): -1 | 0 | 1 {
  const result = parseDecimal(a).comparedTo(parseDecimal(b))
  return result as -1 | 0 | 1
}

/**
 * Check if two decimal values are equal.
 *
 * @param a - First value
 * @param b - Second value
 * @returns true if values are equal
 */
export function equals(a: DecimalInput, b: DecimalInput): boolean {
  return parseDecimal(a).equals(parseDecimal(b))
}

/**
 * Get the maximum of multiple decimal values.
 *
 * @param values - Values to compare
 * @returns Maximum value as Decimal
 */
export function max(...values: DecimalInput[]): Decimal {
  if (values.length === 0) {
    return new Decimal(0)
  }
  return Decimal.max(...values.map(parseDecimal))
}

/**
 * Get the minimum of multiple decimal values.
 *
 * @param values - Values to compare
 * @returns Minimum value as Decimal
 */
export function min(...values: DecimalInput[]): Decimal {
  if (values.length === 0) {
    return new Decimal(0)
  }
  return Decimal.min(...values.map(parseDecimal))
}

// Re-export Decimal class for direct use when needed
export { Decimal }
