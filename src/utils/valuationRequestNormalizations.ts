import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import { mapFrontendCategoryToBackend } from '../store/useNormalizationStore'
import type { EbitdaNormalization } from '../types/ebitdaNormalization'
import { ValidationError } from '../types/errors'
import {
  mapLegacyCustomAdjustment,
  mapLegacyNormalizationAdjustment,
  type NormYearEntry,
  toFiniteNumber,
} from './buildValuationRequest.helpers'
import { normalizeImportedLedgerReviewStatuses } from './importedLedgerNormalization'
import { generalLogger } from './logger'
import { getNormalizationAmountForBase } from './normalizationMath'

export interface BuildValuationRequestNormalizationsParams {
  companyName: string
  rawNormalizationItems: readonly NormalizationItem[]
  legacyNormalizations: Record<number, EbitdaNormalization>
  allDataYears: number[]
  yearEbitdaMap: Record<number, number>
}

export function buildValuationRequestNormalizations({
  companyName,
  rawNormalizationItems,
  legacyNormalizations,
  allDataYears,
  yearEbitdaMap,
}: BuildValuationRequestNormalizationsParams): Record<number, NormYearEntry> {
  const allItems = normalizeImportedLedgerReviewStatuses(rawNormalizationItems, yearEbitdaMap)
  const acceptedNorms = allItems.filter((n) => n.status === 'accepted')
  const pendingNorms = allItems.filter((n) => n.status === 'pending')

  // Pending suggestions are advisory until accepted. Do not block the report:
  // run on reported EBITDA, while logging enough context to explain why the
  // visible pending addbacks were not included in normalized EBITDA.
  if (pendingNorms.length > 0) {
    const visibleAdjustment = pendingNorms.reduce(
      (sum, n) => sum + (toFiniteNumber(n.adjustment) ?? 0),
      0
    )
    generalLogger.warn(
      '[buildValuationRequest] Pending normalizations left unapplied; proceeding with reported EBITDA',
      {
        business_name: companyName,
        pending_count: pendingNorms.length,
        pending_total_adjustment: visibleAdjustment,
        accepted_count: acceptedNorms.length,
        legacy_normalization_years: Object.keys(legacyNormalizations || {}).length,
        statuses: Array.from(new Set(allItems.map((n) => n.status ?? 'undefined'))),
        note: 'Pending adjustments are omitted from normalized EBITDA until accepted.',
      }
    )
  }

  const allDataYearsSet = new Set(allDataYears)
  const orphanItems: Array<{ id: string; targetYears: number[]; adjustment: number }> = []
  const normByYear: Record<number, NormYearEntry> = {}

  for (const n of acceptedNorms) {
    const yearsToApply: number[] = n.applyAllYears
      ? allDataYears
      : n.applyYears && n.applyYears.length > 0
        ? n.applyYears
        : [n.year]
    const validYearsToApply = yearsToApply.filter((y) => allDataYearsSet.has(y))
    if (validYearsToApply.length === 0 && yearsToApply.length > 0) {
      orphanItems.push({
        id: n.id ?? `${n.year}:${n.category ?? 'unknown'}`,
        targetYears: yearsToApply,
        adjustment: toFiniteNumber(n.adjustment) ?? 0,
      })
      continue
    }

    for (const y of validYearsToApply) {
      if (!normByYear[y]) {
        normByYear[y] = {
          totalAdjustment: 0,
          count: 0,
          confidence: 'medium',
          hasCustomAdjustments: false,
          items: [],
        }
      }

      const rawYearEbitda = yearEbitdaMap[y] ?? 0
      const yearEbitda = Number.isFinite(rawYearEbitda) ? rawYearEbitda : 0
      const amount = getNormalizationAmountForBase(n, yearEbitda)
      normByYear[y].totalAdjustment += amount
      normByYear[y].count++
      if (n.confidence === 'high') normByYear[y].confidence = 'high'
      if (n.source === 'manual') normByYear[y].hasCustomAdjustments = true
      normByYear[y].items.push({
        category: mapFrontendCategoryToBackend(n.category, n.backendCategory),
        amount,
        label: n.ledgerName || n.reason || undefined,
        note: n.reason || undefined,
        source: n.source ?? 'manual',
        confidence: n.confidence ?? 'medium',
        ...(n.ledgerCode && { ledger_code: n.ledgerCode }),
      })
    }
  }

  if (orphanItems.length > 0) {
    const orphanTotal = orphanItems.reduce((s, o) => s + o.adjustment, 0)
    generalLogger.warn(
      '[buildValuationRequest] Dropped accepted normalizations with no matching year in the data set',
      {
        business_name: companyName,
        canonical_years: allDataYears,
        orphan_count: orphanItems.length,
        orphan_total_adjustment: orphanTotal,
        orphans: orphanItems,
        note:
          'These items targeted year(s) outside current_year_data + historical_years_data ' +
          'and would have been silently lost downstream. Either remove them, or extend the ' +
          'historical years to cover the targeted year before resubmitting.',
      }
    )
    throw new ValidationError(
      'Accepted normalizations target fiscal years that are missing from the financial data. Re-import the missing years or remove those normalizations before generating the report.',
      'normalizations',
      orphanItems
    )
  }

  const legacyOrphanYears: Array<{ year: number; totalAdjustment: number }> = []
  for (const [yearKey, legacy] of Object.entries(legacyNormalizations)) {
    const year = Number(yearKey)
    if (!Number.isFinite(year) || normByYear[year]) continue

    const adjustmentCount =
      (legacy.adjustments?.length || 0) + (legacy.custom_adjustments?.length || 0)
    const totalAdjustment = Number(legacy.total_adjustments)

    if (adjustmentCount === 0 && !Number.isFinite(totalAdjustment)) continue

    if (!allDataYearsSet.has(year)) {
      legacyOrphanYears.push({
        year,
        totalAdjustment: Number.isFinite(totalAdjustment) ? totalAdjustment : 0,
      })
      continue
    }

    normByYear[year] = {
      totalAdjustment: Number.isFinite(totalAdjustment) ? totalAdjustment : 0,
      count: adjustmentCount,
      confidence: legacy.confidence_score || 'medium',
      hasCustomAdjustments: (legacy.custom_adjustments?.length ?? 0) > 0,
      items: [
        ...(legacy.adjustments ?? []).map(mapLegacyNormalizationAdjustment),
        ...(legacy.custom_adjustments ?? []).map(mapLegacyCustomAdjustment),
      ],
    }
  }

  if (legacyOrphanYears.length > 0) {
    const legacyOrphanTotal = legacyOrphanYears.reduce((s, o) => s + o.totalAdjustment, 0)
    generalLogger.warn(
      '[buildValuationRequest] Dropped legacy normalization entries with no matching year in the data set',
      {
        business_name: companyName,
        canonical_years: allDataYears,
        orphan_count: legacyOrphanYears.length,
        orphan_total_adjustment: legacyOrphanTotal,
        orphan_years: legacyOrphanYears,
        note:
          'These legacy form-store entries were keyed by year(s) outside ' +
          'current_year_data + historical_years_data and would have been ' +
          'silently lost downstream.',
      }
    )
    throw new ValidationError(
      'Saved EBITDA normalizations target fiscal years that are missing from the financial data. Re-import the missing years or remove those normalizations before generating the report.',
      'normalizations',
      legacyOrphanYears
    )
  }

  return normByYear
}
