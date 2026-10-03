import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import type { CreateVersionRequest, ValuationVersion } from '../types/ValuationVersion'
import { FinancialDecimal } from '../utils/financialDecimal'
import { readFinancialObservations } from '../utils/financialObservations'
import { normalizeImportedLedgerReviewStatuses } from '../utils/importedLedgerNormalization'
import { normalizationDecimal } from '../utils/normalizationAmount'
import { getNormalizationTargetYears } from '../utils/normalizationMath'
import { mapFrontendCategoryToBackend } from './normalizationStoreModel'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function fiscalYear(value: unknown): number | null {
  return /^\d{4}$/.test(String(value)) && Number(value) >= 2000 && Number(value) <= 2100
    ? Number(value)
    : null
}

function reportedEbitda(row: Record<string, unknown>): string | null {
  const status = readFinancialObservations(row.financial_observations).ebitda
  if (status === 'missing' || status === 'placeholder' || status === 'unknown') return null
  const metadata = record(row.ebitda_normalization_metadata)
  const amount = (value: unknown) =>
    value === undefined || value === null || value === '' ? null : normalizationDecimal(value)
  const current = amount(row.ebitda)
  if (row.ebitda_normalized !== true) return current
  const normalized = amount(row.normalized_ebitda ?? metadata.normalized_ebitda)
  // A manual edit replaces the old normalized projection and its stale baseline.
  if (current !== null && normalized !== null && current !== normalized) return current
  return amount(row.reported_ebitda ?? metadata.reported_ebitda)
}

function amountForYear(item: NormalizationItem, reported: string | null): string | null {
  const value = new FinancialDecimal(normalizationDecimal(item.value))
  const amount = normalizationDecimal(item.adjustment)
  if (item.type === 'add' || item.type === 'subtract') return amount
  if (reported === null) return null
  const base = new FinancialDecimal(reported)
  if (item.type === 'absolute') return value.minus(base).toFixed()
  const percent = base.mul(value).div(100)
  return (item.type === 'subtract_percent' ? percent.negated() : percent).toFixed()
}

/** New snapshots retain every decision; only accepted rows contribute to the scenario. */
export function buildVersionNormalizationSnapshot(
  request: CreateVersionRequest,
  items: readonly NormalizationItem[]
): ValuationVersion['normalization_data'] {
  if (!items.length) return undefined
  const form = record(request.formData)
  const rows = [
    form.current_year_data,
    ...(Array.isArray(form.historical_years_data) ? form.historical_years_data : []),
  ]
  const bases = new Map<number, string | null>()
  for (const rawRow of rows) {
    const row = record(rawRow)
    if (row.isForecast === true || row.is_forecast === true) continue
    const year = fiscalYear(row.year)
    if (year === null) continue
    const amount = reportedEbitda(row)
    if (bases.has(year) && bases.get(year) !== amount)
      throw new Error(`Conflicting reported EBITDA for ${year}`)
    bases.set(year, amount)
  }
  const groups = new Map<number, NormalizationItem[]>()
  for (const item of normalizeImportedLedgerReviewStatuses(items, Object.fromEntries(bases))) {
    const years = getNormalizationTargetYears(item, [...bases.keys()])
    if (!years.length) throw new Error('Normalization requires an explicit fiscal period.')
    for (const year of years) {
      if (fiscalYear(year) === null)
        throw new Error('Normalization requires an explicit fiscal period.')
      const group = groups.get(year) ?? []
      if (
        group.some(
          (existing) =>
            (existing.sourceAdjustmentId ?? existing.id) === (item.sourceAdjustmentId ?? item.id)
        )
      )
        throw new Error(`Duplicate normalization adjustment: ${item.id}`)
      group.push(item)
      groups.set(year, group)
    }
  }
  const snapshot: NonNullable<ValuationVersion['normalization_data']> = {}
  for (const [year, group] of groups) {
    const reported = bases.get(year) ?? null
    const adjustments = group.map((item) => ({
      category: mapFrontendCategoryToBackend(item.category, item.backendCategory),
      amount: normalizationDecimal(item.adjustment),
      calculated_amount: amountForYear(item, reported),
      status: item.status,
      note: item.reason,
      confidence: item.confidence,
      ledger_code: item.ledgerCode || undefined,
      ledger_name: item.ledgerName || undefined,
      source: item.source,
      source_ref: item.sourceRef,
      reviewed_at: item.reviewedAt,
      frontend_id: item.id,
      normalization_type: item.type,
      apply_all_years: item.applyAllYears,
      apply_years: getNormalizationTargetYears(item, [...bases.keys()]),
      normalization_value: normalizationDecimal(item.value),
      rule_version: item.ruleVersion,
      source_adjustment_id: item.sourceAdjustmentId ?? item.id,
      owner_role: item.ownerRole,
      actual_owner_compensation:
        item.actualOwnerCompensation === undefined
          ? undefined
          : normalizationDecimal(item.actualOwnerCompensation),
      replacement_owner_compensation:
        item.replacementOwnerCompensation === undefined
          ? undefined
          : normalizationDecimal(item.replacementOwnerCompensation),
    }))
    const accepted = adjustments.filter((row) => row.status === 'accepted')
    const total = accepted.some((row) => row.calculated_amount === null)
      ? null
      : accepted.reduce((sum, row) => sum.plus(row.calculated_amount ?? 0), new FinancialDecimal(0))
    snapshot[String(year)] = {
      schema_version: 'normalization_year.v2',
      currency: typeof form.currency === 'string' ? form.currency : null,
      pricing_status: 'scenario_only',
      pricing_authority: 'valuation_iq_recalculation_required',
      reported_ebitda: reported,
      total_adjustments: total?.toFixed() ?? null,
      normalized_ebitda:
        total !== null && reported !== null ? total.plus(reported).toFixed() : null,
      adjustments,
      custom_adjustments: [],
      confidence_score: group[0]?.confidence || 'medium',
    }
  }
  return snapshot
}
