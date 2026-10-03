import { FinancialDecimal } from './financialDecimal'

/** Admit a decimal only when this numeric UI can round-trip its declared value. */
export function parseFinancialTransportNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text.length > 128 || !/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(text)) return undefined
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) return undefined
  if (parsed === 0 && /[1-9]/.test(text.split(/[eE]/, 1)[0])) return undefined
  return new FinancialDecimal(text).eq(new FinancialDecimal(parsed.toString())) ? parsed : undefined
}
