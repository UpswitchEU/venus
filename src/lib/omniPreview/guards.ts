/**
 * Small, defensive coercions for UI preview inputs (never throws).
 */

export function toFiniteNumber(value: unknown): number | undefined {
  if (value == null) return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** `Number(value)` with non-finite results replaced by `fallback` (default 0). Preserves 0 and negatives. */
export function coalesceFiniteNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}
