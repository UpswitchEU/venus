export type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null
}

export function nestedRecord(
  value: UnknownRecord | null | undefined,
  key: string
): UnknownRecord | null {
  return value ? asRecord(value[key]) : null
}

export function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function toPositiveFiniteNumber(value: unknown): number | null {
  const numeric = toFiniteNumber(value)
  return numeric != null && numeric > 0 ? numeric : null
}

export function midpointFromPositiveRange(low: number | null, high: number | null): number | null {
  if (low == null || high == null || low <= 0 || high <= 0) return null
  return Math.round((low + high) / 2)
}

export function toFiniteNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const normalized = value.map(toFiniteNumber)
  return normalized.every((v): v is number => v != null) ? normalized : null
}
