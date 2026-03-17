import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'

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
