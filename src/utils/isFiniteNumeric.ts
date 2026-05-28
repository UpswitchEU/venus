/** Treat persisted form/session numbers that may arrive as numeric strings. */
export function isFiniteNumeric(value: unknown): value is number {
  if (value == null || value === '') return false
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n)
}

export function coerceFiniteNumber(value: unknown): number | undefined {
  if (!isFiniteNumeric(value)) return undefined
  return typeof value === 'number' ? value : Number(value)
}
