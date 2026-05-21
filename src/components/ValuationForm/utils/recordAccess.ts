function getRecordValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return (value as Record<string, unknown>)[key]
}

export function getStringRecordValue(value: unknown, key: string): string | undefined {
  const recordValue = getRecordValue(value, key)
  return typeof recordValue === 'string' ? recordValue : undefined
}

export function getNumberRecordValue(value: unknown, key: string): number | undefined {
  const recordValue = getRecordValue(value, key)
  return typeof recordValue === 'number' && Number.isFinite(recordValue) ? recordValue : undefined
}

export function getPrefilledQuery(partialData: unknown): string | null {
  return getStringRecordValue(partialData, '_prefilledQuery') ?? null
}

export function getYearlyFinancials(data: unknown): unknown {
  if (!data || typeof data !== 'object') return []
  const record = data as Record<string, unknown>
  return record.yearlyFinancials ?? record.historical_years_data ?? []
}
