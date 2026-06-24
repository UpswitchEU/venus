import { parseFlexibleNumber } from '@/utils/isFiniteNumeric'

export const formatCurrency = (amount: number) => {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  const rounded = Math.round(abs)
  return abs >= 1_000_000
    ? `${sign}€${(abs / 1_000_000).toFixed(1)}M`
    : rounded >= 1_000
      ? `${sign}€${Math.round(abs / 1_000)}K`
      : `${sign}€${rounded}`
}

export const formatMultiple = (value: number | null) =>
  value == null ? null : `${value.toFixed(2)}×`

export const formatPercent = (value: number | null, scale = 1) =>
  value == null ? null : `${(value * scale).toFixed(1)}%`

export const toNumberOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null
  return parseFlexibleNumber(value) ?? null
}

export const sumAdjustmentValues = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (Array.isArray(value)) {
    const total = value.reduce((sum, item) => {
      if (!item || typeof item !== 'object') return sum
      const record = item as Record<string, unknown>
      const amount =
        toNumberOrNull(record.amount) ??
        toNumberOrNull(record.value) ??
        toNumberOrNull(record.adjustment) ??
        toNumberOrNull(record.delta) ??
        0
      return sum + amount
    }, 0)
    return Number.isFinite(total) ? total : null
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
