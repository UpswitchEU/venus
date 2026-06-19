import type { NormalizationType } from './UnifiedNormalizationTypes'

type AdjustmentInput = {
  type: NormalizationType
  numericValue: number
  safeEbitda: number
}

export type NormalizationAdjustmentGuard = {
  kind: 'blocked' | 'warning'
  pct: string
}

function parseLocalizedAmount(value: string): number | null {
  const raw = value.trim().replace(/[^\d.,-]/g, '')
  if (!/\d/.test(raw)) return null

  const sign = raw.trim().startsWith('-') ? '-' : ''
  const unsigned = raw.replace(/-/g, '')
  const lastComma = unsigned.lastIndexOf(',')
  const lastDot = unsigned.lastIndexOf('.')

  let normalized = unsigned

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ','
    normalized = unsigned
      .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
      .replace(decimalSeparator, '.')
  } else if (lastComma !== -1 || lastDot !== -1) {
    const separator = lastComma !== -1 ? ',' : '.'
    const parts = unsigned.split(separator)
    const hasThousandsGrouping =
      parts.length > 1 && parts[0].length <= 3 && parts.slice(1).every((part) => part.length === 3)

    if (hasThousandsGrouping) {
      normalized = parts.join('')
    } else {
      const decimal = parts.pop() ?? ''
      normalized = `${parts.join('')}.${decimal}`
    }
  }

  const parsed = Number(`${sign}${normalized}`)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseNormalizationInputValue(value: string): number | null {
  return parseLocalizedAmount(value)
}

export function calculateNormalizationAdjustment({
  type,
  numericValue,
  safeEbitda,
}: AdjustmentInput): number {
  let adjustment = numericValue

  if (type === 'add_percent') {
    adjustment = (safeEbitda * numericValue) / 100
  } else if (type === 'subtract_percent') {
    adjustment = -((safeEbitda * numericValue) / 100)
  } else if (type === 'subtract') {
    adjustment = -numericValue
  } else if (type === 'absolute') {
    adjustment = numericValue - safeEbitda
  }

  return Number.isFinite(adjustment) ? adjustment : 0
}

export function getNormalizationAdjustmentGuard({
  adjustment,
  safeEbitda,
}: {
  adjustment: number
  safeEbitda: number
}): NormalizationAdjustmentGuard | null {
  if (!Number.isFinite(safeEbitda) || safeEbitda <= 0 || !Number.isFinite(adjustment)) {
    return null
  }

  const pctOfEbitda = (Math.abs(adjustment) / safeEbitda) * 100
  if (pctOfEbitda > 200) return { kind: 'blocked', pct: pctOfEbitda.toFixed(0) }
  if (pctOfEbitda > 30) return { kind: 'warning', pct: pctOfEbitda.toFixed(0) }
  return null
}

export function parseNormalizationPromptAmount(
  value: string,
  options: { ledgerCode?: string } = {}
): string | null {
  const ignoredLedgerCode = options.ledgerCode?.trim()
  const amountPattern = /(€)?\s*(-?\d{1,3}(?:[.,]\d{3})+|-?\d+(?:[.,]\d+)?)\s*(k)?\b/gi

  for (const match of value.matchAll(amountPattern)) {
    const hasCurrency = Boolean(match[1])
    const rawAmount = match[2] ?? ''
    const hasThousandsSuffix = Boolean(match[3])
    const isBareLedgerCode =
      ignoredLedgerCode && !hasCurrency && !hasThousandsSuffix && rawAmount === ignoredLedgerCode

    if (isBareLedgerCode) continue

    const parsed = parseLocalizedAmount(rawAmount)
    if (parsed == null) continue

    const amount = hasThousandsSuffix ? parsed * 1000 : parsed
    if (!Number.isFinite(amount)) continue

    return String(amount)
  }

  return null
}
