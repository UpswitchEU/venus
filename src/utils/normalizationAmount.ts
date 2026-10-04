import { FinancialDecimal } from './financialDecimal'

/** Strict decimal transport, independent of display locale. */
export function normalizationDecimal(value: unknown): string {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value)) ||
    String(value).length > 100
  ) {
    throw new Error('Normalization amount must be an explicit finite decimal.')
  }
  const decimal = new FinancialDecimal(value)
  if (!decimal.isFinite() || decimal.abs().gte('1e18') || decimal.decimalPlaces() > 8) {
    throw new Error('Normalization amount exceeds the supported magnitude or precision.')
  }
  if (decimal.isZero() && /[1-9]/.test(String(value).split(/[eE]/)[0])) {
    throw new Error('Normalization amount underflows the supported precision.')
  }
  return decimal.toFixed()
}

/** Legacy UI adapter: fail explicitly when this control cannot retain the exact value. */
export function normalizationNumber(value: unknown): number {
  const decimal = normalizationDecimal(value)
  const number = Number(decimal)
  if (!new FinancialDecimal(number).eq(decimal)) {
    throw new Error('Normalization amount cannot be represented exactly by this numeric control.')
  }
  return number
}
