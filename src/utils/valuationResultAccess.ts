function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function getRecordValue(value: unknown, key: string): unknown {
  return asRecord(value)?.[key]
}

function toFiniteNumber(value: unknown): number | null {
  return parseFinancialTransportNumber(value) ?? null
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = toFiniteNumber(value)
    if (numeric !== null) return numeric
  }
  return null
}

function valuationSummary(value: unknown): Record<string, unknown> | null {
  return asRecord(getRecordValue(value, 'valuation_summary'))
}

function details(value: unknown): Record<string, unknown> | null {
  return asRecord(getRecordValue(value, 'details'))
}

export function getFinancialValueBasis(value: unknown): 'equity_value' | 'enterprise_value' | null {
  const record = asRecord(value)
  const explicit = record?.value_basis ?? record?.valueBasis
  if (explicit === 'equity_value' || explicit === 'enterprise_value') return explicit
  return firstFiniteNumber(
    record?.equity_value_mid,
    record?.valuation_midpoint,
    valuationSummary(value)?.final_valuation
  ) != null
    ? 'equity_value'
    : null
}

export function financialResultsComparable(a: unknown, b: unknown): boolean {
  const currency = asRecord(a)?.currency
  const basis = getFinancialValueBasis(a)
  return (
    typeof currency === 'string' &&
    /^[A-Z]{3}$/.test(currency) &&
    currency === asRecord(b)?.currency &&
    basis != null &&
    basis === getFinancialValueBasis(b)
  )
}

export function getFinalValuation(value: unknown): number | null {
  return getRawFinalValuation(value)
}

export function getRawFinalValuation(value: unknown): number | null {
  const summary = valuationSummary(value)
  const detail = details(value)
  return firstFiniteNumber(
    summary?.final_valuation,
    getRecordValue(value, 'value'),
    getRecordValue(value, 'equity_value_mid'),
    getRecordValue(value, 'valuation_midpoint'),
    detail?.valuation_midpoint,
    detail?.equity_value_mid
  )
}

export function getEquityValueLow(value: unknown): number | null {
  if (getFinancialValueBasis(value) === 'enterprise_value') return null
  const summary = valuationSummary(value)
  const detail = details(value)
  return firstFiniteNumber(
    getRecordValue(value, 'equity_value_low'),
    summary?.equity_value_low,
    getRecordValue(value, 'valuation_min'),
    detail?.valuation_min,
    detail?.equity_value_low
  )
}

export function getEquityValueMid(value: unknown): number | null {
  if (getFinancialValueBasis(value) === 'enterprise_value') return null
  return firstFiniteNumber(getRecordValue(value, 'equity_value_mid'), getRawFinalValuation(value))
}

export function getEquityValueHigh(value: unknown): number | null {
  if (getFinancialValueBasis(value) === 'enterprise_value') return null
  const summary = valuationSummary(value)
  const detail = details(value)
  return firstFiniteNumber(
    getRecordValue(value, 'equity_value_high'),
    summary?.equity_value_high,
    getRecordValue(value, 'valuation_max'),
    detail?.valuation_max,
    detail?.equity_value_high
  )
}

export function getRecommendedAskingPrice(value: unknown): number | null {
  if (getFinancialValueBasis(value) === 'enterprise_value') return null
  const summary = valuationSummary(value)
  const amount = firstFiniteNumber(
    getRecordValue(value, 'recommended_asking_price'),
    summary?.recommended_asking_price
  )
  return amount != null && amount >= 0 ? amount : null
}

export function getBaseValuation(value: unknown): number | null {
  return firstFiniteNumber(valuationSummary(value)?.base_valuation)
}

export function getAdjustmentsTotal(value: unknown): number | null {
  return firstFiniteNumber(valuationSummary(value)?.adjustments_total)
}

export function getNormalizedEbitda(value: unknown): number | null {
  const detail = details(value)
  return firstFiniteNumber(
    getRecordValue(value, 'normalized_ebitda'),
    getRecordValue(value, 'ebitda'),
    detail?.normalized_ebitda,
    detail?.ebitda
  )
}

export function getValuationMultiple(value: unknown): number | null {
  const detail = details(value)
  return firstFiniteNumber(
    getRecordValue(value, 'ebitda_multiple'),
    getRecordValue(value, 'revenue_multiple'),
    detail?.ebitda_multiple,
    detail?.revenue_multiple
  )
}

import { parseFinancialTransportNumber } from './financialTransport'
