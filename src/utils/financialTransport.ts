/** Parse JSON financial numbers using decimal transport syntax, without locale grouping. */
export function parseFinancialTransportNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(text)) return undefined
  const parsed = Number(text)
  // A nonzero decimal below Number's range is unknown to this numeric UI, never an observed zero.
  if (parsed === 0 && /[1-9]/.test(text.split(/[eE]/, 1)[0])) return undefined
  return Number.isFinite(parsed) ? parsed : undefined
}
