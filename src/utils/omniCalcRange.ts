import { parseFinancialTransportNumber } from './financialTransport'

export type OmniRangeSource = 'model'

export interface OmniMethodRangeInput {
  value: number | null
  available: boolean
  value_basis?: 'equity_value' | 'enterprise_value' | null
  value_low?: number | string | null
  value_high?: number | string | null
  equity_value_low?: number | string | null
  equity_value_high?: number | string | null
  details?: Record<string, unknown> | null
}

/** Preserve one published equity band; never sort, round, or combine conflicting aliases. */
export function getOmniMethodEquityRange(method: OmniMethodRangeInput): {
  low: number
  high: number
  source: OmniRangeSource
} | null {
  const point = parseFinancialTransportNumber(method.value)
  if (!method.available || point === undefined || method.value_basis === 'enterprise_value')
    return null
  const pairs = [
    [method.equity_value_low, method.equity_value_high],
    [method.value_low, method.value_high],
    [method.details?.equity_range_low, method.details?.equity_range_high],
    [method.details?.equity_low, method.details?.equity_high],
    [method.details?.equity_value_low, method.details?.equity_value_high],
  ]
  for (const [rawLow, rawHigh] of pairs) {
    if (rawLow == null && rawHigh == null) continue
    const low = parseFinancialTransportNumber(rawLow)
    const high = parseFinancialTransportNumber(rawHigh)
    if (low === undefined || high === undefined || low > point || high < point) return null
    return { low, high, source: 'model' }
  }
  return null
}

/** Enterprise and equity bands remain separate throughout method comparison and export. */
export function getOmniMethodRange(method: OmniMethodRangeInput) {
  if (method.value_basis !== 'enterprise_value') return getOmniMethodEquityRange(method)
  const point = parseFinancialTransportNumber(method.value)
  if (!method.available || point === undefined) return null
  const pairs = [
    [method.value_low, method.value_high],
    [method.details?.enterprise_value_low, method.details?.enterprise_value_high],
    [method.details?.enterprise_range_low, method.details?.enterprise_range_high],
  ]
  for (const [rawLow, rawHigh] of pairs) {
    if (rawLow == null && rawHigh == null) continue
    const low = parseFinancialTransportNumber(rawLow)
    const high = parseFinancialTransportNumber(rawHigh)
    if (low === undefined || high === undefined || low > point || high < point) return null
    return { low, high, source: 'model' as const }
  }
  return null
}
