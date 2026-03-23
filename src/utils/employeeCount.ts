const EMPLOYEE_COUNT_RANGE_MAP: Record<string, number> = {
  '1-10': 5,
  '10-50': 25,
  '11-25': 18,
  '26-50': 38,
  '50-100': 75,
  '51-100': 75,
  '100-500': 250,
  '101-500': 250,
  '500+': 750,
}

export function parseEmployeeCount(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : undefined
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const normalizedRange = trimmed.replace(/\s+/g, '')
  const mappedRangeValue = EMPLOYEE_COUNT_RANGE_MAP[normalizedRange]
  if (mappedRangeValue !== undefined) {
    return mappedRangeValue
  }

  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10)
    return Number.isNaN(parsed) || parsed < 0 ? undefined : parsed
  }

  return undefined
}
