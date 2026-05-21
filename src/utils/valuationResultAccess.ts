function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function getRecordValue(value: unknown, key: string): unknown {
  return asRecord(value)?.[key]
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
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

export function getFinalValuation(value: unknown): number | null {
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
  return firstFiniteNumber(getRecordValue(value, 'equity_value_mid'), getFinalValuation(value))
}

export function getEquityValueHigh(value: unknown): number | null {
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
  const summary = valuationSummary(value)
  return firstFiniteNumber(
    getRecordValue(value, 'recommended_asking_price'),
    summary?.recommended_asking_price
  )
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
