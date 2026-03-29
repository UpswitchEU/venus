/**
 * Small, defensive coercions for UI preview inputs (never throws).
 */

export function toFiniteNumber(value: unknown): number | undefined {
  if (value == null) return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}
