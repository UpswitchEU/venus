import { getCurrentFilingYear } from '../../utils/fiscalYear'
import { getReportedEbitdaBaseline } from '../../utils/normalizationMath'
import type { CrossYearPendingNormalizationGroup } from './UnifiedNormalizationCrossYearSuggestions'
import type { NormalizationItem } from './UnifiedNormalizationTypes'

interface FallbackFormData {
  yearlyFinancials?: Array<{ ebitda?: unknown }>
  current_year_data?: { ebitda?: unknown }
  ebitda?: unknown
}

export function resolveAvailableYears(currentYear: number, financialYears?: number[]): number[] {
  const base = Number.isFinite(currentYear) ? currentYear : getCurrentFilingYear()
  if (financialYears && financialYears.length > 0) {
    const valid = financialYears.filter((y) => Number.isFinite(y)) as number[]
    return valid.length > 0
      ? [...valid].sort((a, b) => b - a)
      : [base, base - 1, base - 2, base - 3]
  }
  return [base, base - 1, base - 2, base - 3]
}

export function resolveSafeOriginalEbitda({
  currentYear,
  originalEBITDA,
  originalEBITDAByYear,
  fallbackFormData,
}: {
  currentYear: number
  originalEBITDA: number
  originalEBITDAByYear?: Record<number, number>
  fallbackFormData: unknown
}): number {
  const fallback = fallbackFormData as FallbackFormData | null | undefined

  return getReportedEbitdaBaseline({
    year: currentYear,
    originalEBITDAByYear,
    fallbackCandidates: [
      originalEBITDA,
      fallback?.yearlyFinancials?.[0]?.ebitda,
      fallback?.current_year_data?.ebitda,
      fallback?.ebitda,
    ],
  })
}

export function countPersistedTaxLatencyCandidates(fallbackFormData: unknown): number {
  const formData = fallbackFormData as Record<string, unknown> | null | undefined
  if (!formData || typeof formData !== 'object') return 0
  const businessContext =
    formData.business_context && typeof formData.business_context === 'object'
      ? (formData.business_context as Record<string, unknown>)
      : null
  const fromBusinessContext =
    businessContext?._imported_ledger_analysis &&
    typeof businessContext._imported_ledger_analysis === 'object'
      ? ((businessContext._imported_ledger_analysis as Record<string, unknown>)
          .tax_latency_candidates ?? null)
      : null
  const fromTopLevel =
    formData._imported_ledger_analysis && typeof formData._imported_ledger_analysis === 'object'
      ? ((formData._imported_ledger_analysis as Record<string, unknown>).tax_latency_candidates ??
        null)
      : null
  const candidates = Array.isArray(fromBusinessContext)
    ? fromBusinessContext
    : Array.isArray(fromTopLevel)
      ? fromTopLevel
      : []
  return candidates.length
}

export function buildCrossYearPendingGroups(
  filteredNormalizations: NormalizationItem[]
): CrossYearPendingNormalizationGroup[] {
  const buckets = new Map<string, CrossYearPendingNormalizationGroup>()
  for (const normalization of filteredNormalizations) {
    if (normalization.status !== 'pending') continue
    if (Number.isFinite(normalization.adjustment) && Math.abs(normalization.adjustment) > 0) {
      continue
    }
    const key = `${(normalization.ledgerCode || '').trim().toLowerCase()}|${(normalization.reason || '').trim().toLowerCase()}|${normalization.source}`
    const existing = buckets.get(key)
    const year = Number.isFinite(normalization.year) ? normalization.year : null
    if (existing) {
      existing.ids.push(normalization.id)
      if (year != null && !existing.years.includes(year)) existing.years.push(year)
    } else {
      buckets.set(key, {
        sample: normalization,
        ids: [normalization.id],
        years: year != null ? [year] : [],
      })
    }
  }
  return Array.from(buckets.values())
    .filter((bucket) => bucket.years.length >= 2)
    .map((bucket) => ({
      ...bucket,
      years: bucket.years.sort((a, b) => b - a),
    }))
}

export function groupNormalizationsByYear({
  filteredNormalizations,
  availableYears,
  crossYearPendingIds,
}: {
  filteredNormalizations: NormalizationItem[]
  availableYears: number[]
  crossYearPendingIds: Set<string>
}): Array<{ year: number; items: NormalizationItem[] }> {
  const groups = new Map<number, NormalizationItem[]>()

  filteredNormalizations.forEach((normalization) => {
    if (crossYearPendingIds.has(normalization.id)) return
    const years = normalization.applyAllYears
      ? availableYears
      : normalization.applyYears && normalization.applyYears.length > 0
        ? normalization.applyYears
        : Number.isFinite(normalization.year)
          ? [normalization.year]
          : []

    for (const year of years) {
      if (!Number.isFinite(year)) continue
      if (!groups.has(year)) groups.set(year, [])
      groups.get(year)?.push(normalization)
    }
  })

  return Array.from(groups.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, items]) => ({ year, items }))
}
