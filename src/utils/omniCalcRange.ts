/**
 * Omni-Calc: derive equity low/high for display.
 * Prefers model-backed band from engine `details` when present; otherwise ±20% illustrative band.
 */

export type OmniRangeSource = 'model' | 'illustrative'

export interface OmniMethodRangeInput {
  value: number | null
  available: boolean
  details?: Record<string, unknown> | null
}

function pickNumeric(
  details: Record<string, unknown> | null | undefined,
  keys: string[]
): number | null {
  if (!details) return null
  for (const k of keys) {
    const v = details[k]
    if (v == null) continue
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/**
 * Returns sorted low/high and whether values come from the valuation engine or a fallback band.
 */
export function getOmniMethodEquityRange(method: OmniMethodRangeInput): {
  low: number
  high: number
  source: OmniRangeSource
} | null {
  if (!method.available || method.value == null || !Number.isFinite(Number(method.value)))
    return null
  const mid = Number(method.value)
  const low = pickNumeric(method.details, ['equity_range_low', 'equity_low', 'equity_value_low'])
  const high = pickNumeric(method.details, [
    'equity_range_high',
    'equity_high',
    'equity_value_high',
  ])
  if (low != null && high != null && low > 0 && high > 0) {
    return {
      low: Math.round(Math.min(low, high)),
      high: Math.round(Math.max(low, high)),
      source: 'model',
    }
  }
  return {
    low: Math.round(mid * 0.8),
    high: Math.round(mid * 1.2),
    source: 'illustrative',
  }
}
