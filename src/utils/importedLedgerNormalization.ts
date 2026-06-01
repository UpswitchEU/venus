/**
 * Build EBITDA normalization draft items from Titan/Mercury imported-ledger SDE flags.
 * Shared by bootstrap prefill and session restoration so persisted analysis is consistent.
 *
 * SDE flags from synced accounting data are accepted only when reported EBITDA
 * proves they stay within the defensibility cap; uncertain or extreme addbacks
 * remain pending review.
 */

import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'
import { isMarPersonnelSocialChargesBucket } from '../lib/mar/marAccountCodes'
import { coalesceFiniteNumber } from '../lib/omniPreview'
import { getCurrentFilingYear } from './fiscalYear'

/** Minimal shape for flags from `_imported_ledger_analysis` or bootstrap financials */
export interface ImportedLedgerSdeFlag {
  ledger_code: string
  ledger_name: string
  amount: number
  deviation_pct?: number
  benchmark_median_pct?: number
  benchmark_std_pct?: number
  actual_pct_of_revenue?: number
  z_score?: number
  confidence?: number
  year?: number
  potential_sde_addback?: boolean
  suggested_question: string
  rationale?: string
  category?: string
  /**
   * Heuristic default share (% of `amount`) plausibly private spending.
   * When provided, the prefill seeds the normalization item with the
   * derived `suggested_addback_amount` (= amount × pct/100) instead of
   * the raw line total — so accountants accept/edit a sensible default.
   */
  default_private_use_pct?: number
  suggested_addback_amount?: number
}

export interface ImportedLedgerAnalysisLike {
  latest_fiscal_year?: number
  sde_flags?: ImportedLedgerSdeFlag[]
  ev_equity_bridge?: Record<string, number>
  dcf_defaults?: { average_depreciation?: number; suggested_capex?: number }
  /** Reported EBITDA by fiscal year — used to keep extreme auto-addbacks pending for review. */
  reported_ebitda_by_year?: Record<number, number>
}

const AUTO_NORM_DEFENSIBILITY_CAP_RATIO = 0.5

export function buildReportedEbitdaByYearFromFormRecords(options: {
  currentYearData?: { year?: number; ebitda?: number }
  historicalYearsData?: Array<{ year?: number; ebitda?: number }>
  yearlyFinancials?: Array<{ year?: number | string; ebitda?: number; isForecast?: boolean }>
  yearData?: Record<string | number, { ebitda?: number }>
  fallbackYear?: number
  fallbackEbitda?: number
}): Record<number, number> {
  const map: Record<number, number> = {}

  const add = (year: unknown, ebitda: unknown) => {
    const y = Number(year)
    const e = Number(ebitda)
    if (Number.isFinite(y) && Number.isFinite(e)) map[y] = e
  }

  if (options.currentYearData) {
    add(options.currentYearData.year, options.currentYearData.ebitda)
  }
  for (const row of options.historicalYearsData ?? []) {
    add(row.year, row.ebitda)
  }
  for (const row of options.yearlyFinancials ?? []) {
    if (row.isForecast) continue
    add(row.year, row.ebitda)
  }
  for (const [year, row] of Object.entries(options.yearData ?? {})) {
    add(year, row?.ebitda)
  }
  add(options.fallbackYear, options.fallbackEbitda)

  return map
}

function resolveAutoImportedNormStatus(
  adjustment: number,
  year: number,
  reportedEbitdaByYear?: Record<number, number>
): NormalizationItem['status'] {
  const reported = reportedEbitdaByYear?.[year]
  if (!(adjustment > 0)) return 'accepted'
  if (reported == null || !(reported > 0)) return 'pending'
  return adjustment / reported > AUTO_NORM_DEFENSIBILITY_CAP_RATIO ? 'pending' : 'accepted'
}

function resolveImportedFlagYear(
  flagYear: unknown,
  analysis: Pick<ImportedLedgerAnalysisLike, 'latest_fiscal_year' | 'reported_ebitda_by_year'>
): number {
  const explicitYear = Number(flagYear)
  if (Number.isFinite(explicitYear) && explicitYear >= 2000 && explicitYear <= 2100) {
    return explicitYear
  }

  const latestYear = Number(analysis.latest_fiscal_year)
  if (Number.isFinite(latestYear) && latestYear >= 2000 && latestYear <= 2100) {
    return latestYear
  }

  const reportedYears = Object.keys(analysis.reported_ebitda_by_year ?? {})
    .map(Number)
    .filter((year) => Number.isFinite(year) && year >= 2000 && year <= 2100)
  if (reportedYears.length > 0) {
    return Math.max(...reportedYears)
  }

  return getCurrentFilingYear()
}

function importedItemReviewed(item: NormalizationItem): boolean {
  return typeof item.reviewedAt === 'string' && item.reviewedAt.trim().length > 0
}

function importedItemTargetYears(item: NormalizationItem): number[] {
  if (item.applyAllYears) return []
  if (item.applyYears && item.applyYears.length > 0) return item.applyYears
  return [item.year]
}

export function normalizeImportedLedgerReviewStatuses(
  items: readonly NormalizationItem[],
  reportedEbitdaByYear: Record<number, number>
): NormalizationItem[] {
  let changed = false
  const next = items.map((item) => {
    const isImported = item.id.startsWith('imported_sde_')
    if (!isImported || item.status !== 'accepted' || importedItemReviewed(item)) return item

    const targetYears = importedItemTargetYears(item)
    const yearsToCheck =
      targetYears.length > 0 ? targetYears : Object.keys(reportedEbitdaByYear).map(Number)
    if (yearsToCheck.length === 0 && item.adjustment > 0) {
      changed = true
      return { ...item, status: 'pending' as const }
    }
    const mustReview = yearsToCheck.some(
      (year) =>
        resolveAutoImportedNormStatus(item.adjustment, year, reportedEbitdaByYear) === 'pending'
    )
    if (!mustReview) return item

    changed = true
    return { ...item, status: 'pending' as const }
  })

  return changed ? next : [...items]
}

function mapImportedLedgerCategory(category?: string): NormalizationItem['category'] {
  switch (category) {
    case 'owner_compensation':
      return 'salary'
    case 'related_party_rent':
      return 'rent'
    case 'management_fees':
    case 'discretionary_expense':
      return 'vehicle'
    default:
      return 'other'
  }
}

function mapImportedLedgerBackendCategory(category?: string): string | undefined {
  switch (category) {
    case 'owner_compensation':
      return 'owner_compensation_adjustment'
    case 'related_party_rent':
      return 'related_party_transactions'
    case 'management_fees':
      return 'related_party_transactions'
    case 'discretionary_expense':
      return 'discretionary_expenses'
    default:
      return undefined
  }
}

function mapImportedLedgerConfidence(confidence?: number): NormalizationItem['confidence'] {
  if ((confidence ?? 0) >= 0.8) return 'high'
  if ((confidence ?? 0) >= 0.6) return 'medium'
  return 'low'
}

export function buildNormalizationItemsFromImportedLedgerAnalysis(
  analysis: ImportedLedgerAnalysisLike
): NormalizationItem[] {
  const flags = (analysis.sde_flags ?? []).filter(
    (flag) => !isMarPersonnelSocialChargesBucket(flag.ledger_code)
  )
  if (!flags.length) return []

  return flags.map((flag, index) => {
    const rawAmount = coalesceFiniteNumber(flag.amount)
    const heuristicAmount =
      flag.suggested_addback_amount != null && Number.isFinite(flag.suggested_addback_amount)
        ? Number(flag.suggested_addback_amount)
        : flag.default_private_use_pct != null && Number.isFinite(flag.default_private_use_pct)
          ? rawAmount * (Number(flag.default_private_use_pct) / 100)
          : null
    const seededAmount = heuristicAmount != null ? heuristicAmount : rawAmount

    const baseReason = flag.rationale || flag.suggested_question
    const reason =
      heuristicAmount != null && flag.default_private_use_pct != null
        ? `${baseReason} Default ${flag.default_private_use_pct.toFixed(0)}% private-use share applied; adjust as needed.`
        : baseReason

    const year = resolveImportedFlagYear(flag.year, analysis)

    return {
      id: `imported_sde_${year}_${flag.ledger_code}_${index}`,
      ledgerCode: flag.ledger_code,
      ledgerName: flag.ledger_name,
      category: mapImportedLedgerCategory(flag.category),
      backendCategory: mapImportedLedgerBackendCategory(flag.category),
      type: 'add' as const,
      value: rawAmount,
      adjustment: seededAmount,
      reason,
      source: 'auto' as const,
      sourceRef: `${year}:${flag.ledger_code}`,
      status: resolveAutoImportedNormStatus(seededAmount, year, analysis.reported_ebitda_by_year),
      applyAllYears: false,
      applyYears: [year],
      year,
      confidence: mapImportedLedgerConfidence(flag.confidence),
      marketBenchmark: flag.benchmark_median_pct,
    }
  })
}
