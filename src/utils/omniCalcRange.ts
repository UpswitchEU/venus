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

interface PublishedRange {
  low: number
  high: number
  source: OmniRangeSource
}

function consistentRange(point: number, pairs: unknown[][]): PublishedRange | null {
  let admitted: PublishedRange | null = null
  for (const [rawLow, rawHigh] of pairs) {
    if (rawLow == null && rawHigh == null) continue
    const low = parseFinancialTransportNumber(rawLow)
    const high = parseFinancialTransportNumber(rawHigh)
    if (low === undefined || high === undefined || low > point || high < point) return null
    if (admitted && (admitted.low !== low || admitted.high !== high)) return null
    admitted = { low, high, source: 'model' }
  }
  return admitted
}

/** Preserve one published equity band; never sort, round, or combine conflicting aliases. */
export function getOmniMethodEquityRange(method: OmniMethodRangeInput): PublishedRange | null {
  const point = parseFinancialTransportNumber(method.value)
  if (!method.available || point === undefined || method.value_basis === 'enterprise_value')
    return null
  return consistentRange(point, [
    [method.equity_value_low, method.equity_value_high],
    [method.value_low, method.value_high],
    [method.details?.equity_range_low, method.details?.equity_range_high],
    [method.details?.equity_low, method.details?.equity_high],
    [method.details?.equity_value_low, method.details?.equity_value_high],
  ])
}

/** Enterprise and equity bands remain separate throughout method comparison and export. */
export function getOmniMethodRange(method: OmniMethodRangeInput) {
  if (method.value_basis !== 'enterprise_value') return getOmniMethodEquityRange(method)
  const point = parseFinancialTransportNumber(method.value)
  if (!method.available || point === undefined) return null
  return consistentRange(point, [
    [method.value_low, method.value_high],
    [method.details?.enterprise_value_low, method.details?.enterprise_value_high],
    [method.details?.enterprise_range_low, method.details?.enterprise_range_high],
  ])
}
