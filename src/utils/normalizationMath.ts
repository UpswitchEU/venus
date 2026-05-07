import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'

/** Whether an accepted normalization item applies to a given year. Single source of truth. */
export function appliesToYear(item: NormalizationItem, year: number): boolean {
  if (item.status !== 'accepted') return false
  if (item.applyAllYears) return true
  if (item.applyYears && item.applyYears.length > 0) return item.applyYears.includes(year)
  return item.year === year
}

/**
 * Item appears under this fiscal year in lists / grouping (any status).
 * Use with `summarizeAcceptedNormalizations` for valuation anchor KPIs.
 */
export function normalizationItemTouchesYear(item: NormalizationItem, year: number): boolean {
  if (!Number.isFinite(year)) return false
  if (item.applyAllYears) return true
  if (item.applyYears && item.applyYears.length > 0) return item.applyYears.includes(year)
  return Number.isFinite(item.year) && item.year === year
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
  const { year, originalEBITDAByYear, fallbackCandidates = [], defaultValue = 0 } = options

  return getFirstFiniteNumber(originalEBITDAByYear?.[year], ...fallbackCandidates) ?? defaultValue
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
): {
  original: number
  adjustment: number
  normalized: number
  pendingAdjustment: number
  pendingCount: number
} {
  const original = Number.isFinite(reportedEbitda) ? reportedEbitda : 0
  const adjustment = items
    .filter((item) => item.status === 'accepted')
    .reduce((sum, item) => sum + getNormalizationAmountForBase(item, original), 0)
  const pendingItems = items.filter((item) => item.status === 'pending')
  const pendingAdjustment = pendingItems.reduce(
    (sum, item) => sum + getNormalizationAmountForBase(item, original),
    0
  )

  return {
    original,
    adjustment,
    normalized: original + adjustment,
    pendingAdjustment,
    pendingCount: pendingItems.length,
  }
}

/**
 * EBITDA bridge KPI for the valuation anchor year: excludes rows that don't apply to anchorYear.
 * Intentionally does not multiply across fiscal years — use for modal/hub headline tiles only.
 */
export function summarizeNormalizationsForAnchorYear(
  items: NormalizationItem[],
  anchorYear: number,
  reportedEbitdaForAnchorYear: number
): {
  original: number
  adjustment: number
  normalized: number
  pendingAdjustment: number
  pendingCount: number
} {
  const scoped = items.filter((n) => normalizationItemTouchesYear(n, anchorYear))
  return summarizeAcceptedNormalizations(scoped, reportedEbitdaForAnchorYear)
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
}): {
  original: number
  adjustment: number
  normalized: number
  pendingAdjustment: number
  pendingCount: number
} {
  const {
    items,
    availableYears,
    reportedEbitdaByYear,
    fallbackYear,
    fallbackReportedEbitda = 0,
  } = options

  const acceptedItems = items.filter((item) => item.status === 'accepted')
  const pendingItems = items.filter((item) => item.status === 'pending')

  // Compute pending contribution by spreading items across the years they apply to
  // (mirrors the accepted flow). This is shown as a secondary signal in the header so
  // users see why the Aanpassing tile is €0 even when there are visible pending rows
  // — without inflating the accepted normalized EBITDA value the report relies on.
  const pendingAdjustment = pendingItems.reduce((acc, item) => {
    const years = item.applyAllYears
      ? availableYears
      : item.applyYears && item.applyYears.length > 0
        ? item.applyYears
        : [item.year]
    let sum = 0
    for (const year of years) {
      if (!Number.isFinite(year)) continue
      const reported =
        getFirstFiniteNumber(reportedEbitdaByYear?.[year], fallbackReportedEbitda) ?? 0
      sum += getNormalizationAmountForBase(item, reported)
    }
    return acc + sum
  }, 0)

  if (acceptedItems.length === 0) {
    const original =
      getFirstFiniteNumber(reportedEbitdaByYear?.[fallbackYear], fallbackReportedEbitda) ?? 0
    return {
      original,
      adjustment: 0,
      normalized: original,
      pendingAdjustment,
      pendingCount: pendingItems.length,
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
      pendingAdjustment,
      pendingCount: pendingItems.length,
    }
  }

  return { ...summary, pendingAdjustment, pendingCount: pendingItems.length }
}

/**
 * When a fiscal year row is removed from financial history, drop or trim normalizations
 * that only applied to that year. Items with `applyAllYears` are kept.
 */
export function removeNormalizationsForRemovedFiscalYear(
  items: NormalizationItem[],
  removedYear: number
): NormalizationItem[] {
  const y = removedYear
  const out: NormalizationItem[] = []

  for (const n of items) {
    if (n.applyAllYears) {
      out.push(n)
      continue
    }

    if (n.applyYears && n.applyYears.length > 0) {
      if (!n.applyYears.includes(y)) {
        out.push(n)
        continue
      }
      const nextYears = n.applyYears.filter((yy) => yy !== y).sort((a, b) => a - b)
      if (nextYears.length === 0) {
        continue
      }
      let next: NormalizationItem = { ...n, applyYears: nextYears }
      if (n.year === y) {
        next = { ...next, year: nextYears[0] }
      }
      out.push(next)
      continue
    }

    if (n.year === y) {
      continue
    }
    out.push(n)
  }

  return out
}

/** Normalizations that would be dropped or trimmed when `removedYear` is removed (excludes applyAllYears). */
export function countNormalizationsBoundToFiscalYear(
  items: NormalizationItem[],
  removedYear: number
): number {
  const y = removedYear
  return items.filter((n) => {
    if (n.applyAllYears) return false
    if (n.applyYears && n.applyYears.length > 0) return n.applyYears.includes(y)
    return n.year === y
  }).length
}

export interface AutoNormalizationCapBreach {
  year: number
  reportedEbitda: number
  autoAddback: number
  capAmount: number
  addbackPctOfEbitda: number
}

/**
 * Detect years where accepted auto/imported SDE addbacks exceed a defensibility cap.
 *
 * The cap mirrors Hermes guidance used in the Monard flow: cumulative accepted
 * auto addbacks above 50% of reported EBITDA need explicit reviewer substantiation.
 */
export function findAcceptedAutoNormalizationCapBreaches(options: {
  items: Array<
    Pick<
      NormalizationItem,
      | 'id'
      | 'status'
      | 'source'
      | 'type'
      | 'value'
      | 'adjustment'
      | 'applyAllYears'
      | 'applyYears'
      | 'year'
    >
  >
  availableYears: number[]
  reportedEbitdaByYear?: Record<number, number>
  fallbackYear: number
  fallbackReportedEbitda?: number
  capRatio?: number
}): AutoNormalizationCapBreach[] {
  const {
    items,
    availableYears,
    reportedEbitdaByYear,
    fallbackYear,
    fallbackReportedEbitda = 0,
    capRatio = 0.5,
  } = options

  const reportedByYear = new Map<number, number>()
  const addbackByYear = new Map<number, number>()

  const getReported = (year: number): number =>
    getFirstFiniteNumber(reportedEbitdaByYear?.[year], fallbackReportedEbitda) ?? 0

  for (const item of items) {
    if (item.status !== 'accepted') continue
    const isAutoImported = item.source === 'auto' || item.id.startsWith('imported_sde_')
    if (!isAutoImported) continue

    const years = item.applyAllYears
      ? availableYears
      : item.applyYears && item.applyYears.length > 0
        ? item.applyYears
        : [item.year]

    for (const year of years) {
      if (!Number.isFinite(year)) continue
      const reported = getReported(year)
      // Ratio cap is only meaningful when reported EBITDA is positive.
      if (!(reported > 0)) continue
      reportedByYear.set(year, reported)

      const amount = getNormalizationAmountForBase(item, reported)
      if (amount <= 0) continue
      addbackByYear.set(year, (addbackByYear.get(year) ?? 0) + amount)
    }
  }

  if (!reportedByYear.size && Number.isFinite(fallbackYear)) {
    const fallbackReported = getReported(fallbackYear)
    if (fallbackReported > 0) reportedByYear.set(fallbackYear, fallbackReported)
  }

  return Array.from(reportedByYear.entries())
    .map(([year, reportedEbitda]) => {
      const autoAddback = addbackByYear.get(year) ?? 0
      const capAmount = reportedEbitda * capRatio
      const addbackPctOfEbitda = reportedEbitda > 0 ? (autoAddback / reportedEbitda) * 100 : 0
      return { year, reportedEbitda, autoAddback, capAmount, addbackPctOfEbitda }
    })
    .filter((row) => row.autoAddback > row.capAmount)
    .sort((a, b) => b.year - a.year)
}
