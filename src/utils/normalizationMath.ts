import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'

/** Whether an accepted normalization item applies to a given year. Single source of truth. */
export function appliesToYear(item: NormalizationItem, year: number): boolean {
  if (item.status !== 'accepted') return false
  if (item.applyAllYears) return true
  if (item.applyYears && item.applyYears.length > 0) return item.applyYears.includes(year)
  return item.year === year
}

export function getFirstFiniteNumber(...candidates: unknown[]): number | undefined {
  for (const candidate of candidates) {
    const parsed = Number(candidate)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

export function getReportedEbitdaBaseline(options: {
  year: number
  originalEBITDAByYear?: Record<number, number>
  fallbackCandidates?: unknown[]
  defaultValue?: number
}): number {
  const {
    year,
    originalEBITDAByYear,
    fallbackCandidates = [],
    defaultValue = 0,
  } = options

  return (
    getFirstFiniteNumber(originalEBITDAByYear?.[year], ...fallbackCandidates) ?? defaultValue
  )
}

export function getNormalizationAmountForBase(
  item: Pick<NormalizationItem, 'type' | 'value' | 'adjustment'>,
  reportedEbitda: number
): number {
  const safeReported = Number.isFinite(reportedEbitda) ? reportedEbitda : 0
  const safeValue = Number.isFinite(item.value) ? item.value : 0
  const safeAdjustment = Number.isFinite(item.adjustment) ? item.adjustment : 0

  if (
    safeReported === 0 &&
    (item.type === 'add_percent' || item.type === 'subtract_percent' || item.type === 'absolute')
  ) {
    return safeAdjustment
  }

  if (item.type === 'add_percent') return (safeReported * safeValue) / 100
  if (item.type === 'subtract_percent') return -((safeReported * safeValue) / 100)
  if (item.type === 'absolute') return safeValue - safeReported
  return safeAdjustment
}

export function summarizeAcceptedNormalizations(
  items: Array<Pick<NormalizationItem, 'status' | 'type' | 'value' | 'adjustment'>>,
  reportedEbitda: number
): { original: number; adjustment: number; normalized: number } {
  const original = Number.isFinite(reportedEbitda) ? reportedEbitda : 0
  const adjustment = items
    .filter((item) => item.status === 'accepted')
    .reduce((sum, item) => sum + getNormalizationAmountForBase(item, original), 0)

  return {
    original,
    adjustment,
    normalized: original + adjustment,
  }
}

export function summarizeAcceptedNormalizationsAcrossYears(options: {
  items: Array<
    Pick<
      NormalizationItem,
      'status' | 'type' | 'value' | 'adjustment' | 'applyAllYears' | 'applyYears' | 'year'
    >
  >
  availableYears: number[]
  reportedEbitdaByYear?: Record<number, number>
  fallbackYear: number
  fallbackReportedEbitda?: number
}): { original: number; adjustment: number; normalized: number } {
  const {
    items,
    availableYears,
    reportedEbitdaByYear,
    fallbackYear,
    fallbackReportedEbitda = 0,
  } = options

  const acceptedItems = items.filter((item) => item.status === 'accepted')
  if (acceptedItems.length === 0) {
    const original =
      getFirstFiniteNumber(reportedEbitdaByYear?.[fallbackYear], fallbackReportedEbitda) ?? 0
    return {
      original,
      adjustment: 0,
      normalized: original,
    }
  }

  const yearSummaries = new Map<number, { original: number; adjustment: number }>()

  for (const item of acceptedItems) {
    const years = item.applyAllYears
      ? availableYears
      : item.applyYears && item.applyYears.length > 0
        ? item.applyYears
        : [item.year]

    for (const year of years) {
      if (!Number.isFinite(year)) continue
      const original =
        getFirstFiniteNumber(reportedEbitdaByYear?.[year], fallbackReportedEbitda) ?? 0
      const current = yearSummaries.get(year) ?? { original, adjustment: 0 }
      current.original = original
      current.adjustment += getNormalizationAmountForBase(item, original)
      yearSummaries.set(year, current)
    }
  }

  const summary = Array.from(yearSummaries.values()).reduce<{
    original: number
    adjustment: number
    normalized: number
  }>(
    (acc, year) => ({
      original: acc.original + year.original,
      adjustment: acc.adjustment + year.adjustment,
      normalized: acc.normalized + year.original + year.adjustment,
    }),
    { original: 0, adjustment: 0, normalized: 0 }
  )

  if (summary.original === 0 && summary.adjustment === 0 && summary.normalized === 0) {
    const original =
      getFirstFiniteNumber(reportedEbitdaByYear?.[fallbackYear], fallbackReportedEbitda) ?? 0
    return {
      original,
      adjustment: 0,
      normalized: original,
    }
  }

  return summary
}
