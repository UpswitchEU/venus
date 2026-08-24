import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import { mapFrontendCategoryToBackend } from '../store/useNormalizationStore'
import type { EbitdaNormalization } from '../types/ebitdaNormalization'
import { ValidationError } from '../types/errors'
import type { ValuationNormalizationDecisionInput } from '../types/valuation/request'
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
  ownerRole?: 'working' | 'passive'
  actualOwnerCompensation?: number
}

const OWNER_COMPENSATION_CATEGORY = 'owner_compensation_adjustment'
const VENUS_NORMALIZATION_REVIEW_POLICY_VERSION = 'venus.normalization_review.v1'

function finiteNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function ownerCompensationTerms(
  item: NormalizationItem,
  category: string,
  adjustmentAmount: number,
  fallbackOwnerRole?: 'working' | 'passive',
  fallbackActualOwnerCompensation?: number
): {
  owner_role?: 'working' | 'passive'
  actual_owner_compensation?: number
  replacement_owner_compensation?: number
} {
  if (category !== OWNER_COMPENSATION_CATEGORY) return {}

  const ownerRole = item.ownerRole ?? fallbackOwnerRole
  const explicitActual = finiteNumber(item.actualOwnerCompensation)
  const inferredActual =
    item.type === 'add' || item.type === 'subtract' ? finiteNumber(item.value) : undefined
  const actual = explicitActual ?? finiteNumber(fallbackActualOwnerCompensation) ?? inferredActual
  const explicitReplacement = finiteNumber(item.replacementOwnerCompensation)
  const inferredReplacement = actual == null ? undefined : actual - adjustmentAmount
  const replacement = explicitReplacement ?? inferredReplacement

  if (
    !ownerRole ||
    actual == null ||
    replacement == null ||
    actual < 0 ||
    replacement < 0 ||
    Math.abs(actual - replacement - adjustmentAmount) > 0.01
  ) {
    return {}
  }

  return {
    owner_role: ownerRole,
    actual_owner_compensation: actual,
    replacement_owner_compensation: replacement,
  }
}

export function buildCanonicalNormalizationDecisions({
  normByYear,
  yearEbitdaMap,
  currency,
}: {
  normByYear: Record<number, NormYearEntry>
  yearEbitdaMap: Record<number, number>
  currency?: string
}): ValuationNormalizationDecisionInput[] {
  return Object.entries(normByYear).flatMap(([yearKey, entry]) => {
    const fiscalYear = Number(yearKey)
    const reportedEbitda = yearEbitdaMap[fiscalYear]
    if (!Number.isFinite(fiscalYear) || !Number.isFinite(reportedEbitda)) return []

    return entry.items.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      fiscal_year: fiscalYear,
      field: item.category === OWNER_COMPENSATION_CATEGORY ? item.category : 'ebitda',
      category: item.category,
      label: item.label || item.category,
      original_value: reportedEbitda,
      adjusted_value: reportedEbitda + item.amount,
      adjustment_amount: item.amount,
      reason: item.note || item.label || item.category,
      source: item.source,
      status:
        item.status === 'accepted' || item.status === 'verified'
          ? item.status
          : item.status === 'rejected'
            ? 'rejected'
            : 'proposed',
      ...(item.evidence_id ? { evidence_id: item.evidence_id } : {}),
      ...(item.reviewed_at ? { reviewed_at: item.reviewed_at } : {}),
      ...(item.rule_version ? { rule_version: item.rule_version } : {}),
      ...(item.owner_role ? { owner_role: item.owner_role } : {}),
      ...(item.actual_owner_compensation != null
        ? { actual_owner_compensation: item.actual_owner_compensation }
        : {}),
      ...(item.replacement_owner_compensation != null
        ? { replacement_owner_compensation: item.replacement_owner_compensation }
        : {}),
      ...(currency ? { currency } : {}),
    }))
  })
}

export function buildValuationRequestNormalizations({
  companyName,
  rawNormalizationItems,
  legacyNormalizations,
  allDataYears,
  yearEbitdaMap,
  ownerRole,
  actualOwnerCompensation,
}: BuildValuationRequestNormalizationsParams): Record<number, NormYearEntry> {
  const allItems = normalizeImportedLedgerReviewStatuses(rawNormalizationItems, yearEbitdaMap)
  const acceptedNorms = allItems.filter((n) => n.status === 'accepted')
  const pendingNorms = allItems.filter((n) => n.status === 'pending')
  const unpricedNorms = allItems.filter((n) => n.status !== 'accepted')

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

  const ensureYearEntry = (year: number): NormYearEntry => {
    if (!normByYear[year]) {
      normByYear[year] = {
        totalAdjustment: 0,
        count: 0,
        pendingCount: 0,
        confidence: 'medium',
        hasCustomAdjustments: false,
        items: [],
      }
    }
    return normByYear[year]
  }

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
      const yearEntry = ensureYearEntry(y)

      const rawYearEbitda = yearEbitdaMap[y] ?? 0
      const yearEbitda = Number.isFinite(rawYearEbitda) ? rawYearEbitda : 0
      const amount = getNormalizationAmountForBase(n, yearEbitda)
      const backendCategory = mapFrontendCategoryToBackend(n.category, n.backendCategory)
      const compensationTerms = ownerCompensationTerms(
        n,
        backendCategory,
        amount,
        ownerRole,
        actualOwnerCompensation
      )
      const ruleVersion =
        n.ruleVersion ?? (n.reviewedAt ? VENUS_NORMALIZATION_REVIEW_POLICY_VERSION : undefined)
      yearEntry.totalAdjustment += amount
      yearEntry.count++
      if (n.confidence === 'high') yearEntry.confidence = 'high'
      if (n.source === 'manual') yearEntry.hasCustomAdjustments = true
      yearEntry.items.push({
        id: n.id,
        category: backendCategory,
        amount,
        label: n.ledgerName || n.reason || undefined,
        note: n.reason || undefined,
        source: n.source ?? 'manual',
        status: 'accepted',
        ...(n.sourceRef ? { evidence_id: n.sourceRef } : {}),
        ...(n.reviewedAt ? { reviewed_at: n.reviewedAt } : {}),
        ...(ruleVersion ? { rule_version: ruleVersion } : {}),
        ...compensationTerms,
        confidence: n.confidence ?? 'medium',
        ...(n.ledgerCode && { ledger_code: n.ledgerCode }),
      })
    }
  }

  // Preserve rejected/pending evidence in the request without pricing it. The
  // engine reads the explicit status, keeps these rows in the audit ledger and
  // excludes them from normalized EBITDA until a reviewer accepts them.
  for (const n of unpricedNorms) {
    const yearsToApply: number[] = n.applyAllYears
      ? allDataYears
      : n.applyYears && n.applyYears.length > 0
        ? n.applyYears
        : [n.year]
    for (const y of yearsToApply.filter((year) => allDataYearsSet.has(year))) {
      const rawYearEbitda = yearEbitdaMap[y] ?? 0
      const yearEbitda = Number.isFinite(rawYearEbitda) ? rawYearEbitda : 0
      const yearEntry = ensureYearEntry(y)
      const amount = getNormalizationAmountForBase(n, yearEbitda)
      const backendCategory = mapFrontendCategoryToBackend(n.category, n.backendCategory)
      const compensationTerms = ownerCompensationTerms(
        n,
        backendCategory,
        amount,
        ownerRole,
        actualOwnerCompensation
      )
      const ruleVersion =
        n.ruleVersion ?? (n.reviewedAt ? VENUS_NORMALIZATION_REVIEW_POLICY_VERSION : undefined)
      if (n.status !== 'rejected') {
        yearEntry.pendingCount = (yearEntry.pendingCount ?? 0) + 1
      }
      yearEntry.items.push({
        id: n.id,
        category: backendCategory,
        amount,
        label: n.ledgerName || n.reason || undefined,
        note: n.reason || undefined,
        source: n.source ?? 'manual',
        status: n.status === 'rejected' ? 'rejected' : 'proposed',
        ...(n.sourceRef ? { evidence_id: n.sourceRef } : {}),
        ...(n.reviewedAt ? { reviewed_at: n.reviewedAt } : {}),
        ...(ruleVersion ? { rule_version: ruleVersion } : {}),
        ...compensationTerms,
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
    if (!Number.isFinite(year) || (normByYear[year]?.count ?? 0) > 0) continue

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

    const yearEntry = ensureYearEntry(year)
    yearEntry.totalAdjustment = Number.isFinite(totalAdjustment) ? totalAdjustment : 0
    yearEntry.count = adjustmentCount
    yearEntry.confidence = legacy.confidence_score || 'medium'
    yearEntry.hasCustomAdjustments = (legacy.custom_adjustments?.length ?? 0) > 0
    const legacyItems = [
      ...(legacy.adjustments ?? []).map(mapLegacyNormalizationAdjustment),
      ...(legacy.custom_adjustments ?? []).map(mapLegacyCustomAdjustment),
    ].map((item, index) => ({
      ...item,
      id: item.id || `legacy-normalization-${year}-${index + 1}`,
    }))
    yearEntry.items.push(...legacyItems)
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
