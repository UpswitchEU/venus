/** Capture JSON-like save inputs before an asynchronous operation can yield. */
export function snapshotValue<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value)
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (Array.isArray(value)) return value.map((item) => snapshotValue(item)) as T
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = snapshotValue(child)
  }
  return out as T
}
