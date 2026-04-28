/**
 * Epoch ms when JSON/cache may yield `Date` instances or ISO strings (aligns with Titan `dateLikeToUnixMs`).
 * Returns `null` when missing or unparseable.
 */
export function dateLikeToUnixMs(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime()
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? null : t
  }
  return null
}

/** Non-negative ms since `value` until `nowMs` (handles JSON-hydrated ISO strings). `null` if unparseable. */
export function dateLikeAgeMs(value: unknown, nowMs = Date.now()): number | null {
  const t = dateLikeToUnixMs(value)
  if (t === null) return null
  return Math.max(0, nowMs - t)
}
