import { FinancialDecimal as Decimal } from '@/utils/financialDecimal'
import { parseFinancialTransportNumber } from '@/utils/financialTransport'

export const formatMultiple = (value: number | null) =>
  value == null ? null : `${value.toFixed(2)}×`

export const formatPercent = (value: number | null, scale = 1) =>
  value == null ? null : `${(value * scale).toFixed(1)}%`

export const toNumberOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null
  return parseFinancialTransportNumber(value) ?? null
}

export const sumAdjustmentValues = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (Array.isArray(value)) {
    let total = new Decimal(0)
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const record = item as Record<string, unknown>
      const raw = record.amount ?? record.value ?? record.adjustment ?? record.delta
      const amount = toNumberOrNull(raw)
      if (amount === null) return null
      total = total.plus(amount)
    }
    const amount = total.toNumber()
    return Number.isFinite(amount) ? amount : null
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return (
      toNumberOrNull(record.total_adjustment_amount) ??
      toNumberOrNull(record.total_adjustment) ??
      toNumberOrNull(record.amount) ??
      toNumberOrNull(record.value) ??
      null
    )
  }

  return null
}
