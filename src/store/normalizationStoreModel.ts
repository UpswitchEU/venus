import type {
  NormalizationItem,
  NormalizationSource,
  NormalizationStatus,
} from '../components/calculator/UnifiedNormalizationTypes'
import { requiresIndividualImportedNormalizationReview } from '../components/calculator/UnifiedNormalizationTypes'
import type {
  ConfidenceScoreValue,
  CreateNormalizationRequest,
  CustomAdjustment,
  GetNormalizationResponse,
  NormalizationAdjustment,
  NormalizationCategory,
} from '../types/ebitdaNormalization'
import {
  appliesToYear,
  getNormalizationAmountForBase,
  normalizationItemTouchesYear,
} from '../utils/normalizationMath'

type SessionWithNormalizations = {
  _normalizations?: unknown
}

type PersistedNormalizationAdjustment = NormalizationAdjustment & {
  apply_all_years?: boolean
  apply_years?: number[]
  frontend_id?: string
  normalization_type?: NormalizationItem['type']
  normalization_value?: number
}

type RestoredNormalizationAdjustment = NormalizationAdjustment & {
  apply_all_years?: boolean
  apply_years?: number[]
  frontend_id?: string
  normalization_type?: NormalizationItem['type']
  normalization_value?: number
}

type RestoredCustomAdjustment = CustomAdjustment & {
  apply_all_years?: boolean
  apply_years?: number[]
  frontend_id?: string
  normalization_type?: NormalizationItem['type']
  normalization_value?: number
  note?: string
}

const BACKEND_TO_FRONTEND_CATEGORY: Record<string, NormalizationItem['category']> = {
  owner_compensation_adjustment: 'salary',
  one_time_expenses: 'one-time',
  personal_expenses: 'personal',
  related_party_transactions: 'rent',
  non_recurring_revenue: 'other',
  non_recurring_costs: 'one-time',
  depreciation_adjustment: 'depreciation',
  family_expenses: 'personal',
  unusual_transactions: 'other',
  tax_optimization_reversal: 'other',
  discretionary_expenses: 'other',
  other_adjustments: 'other',
}

const FRONTEND_TO_BACKEND_CATEGORY: Record<string, string> = {
  salary: 'owner_compensation_adjustment',
  rent: 'related_party_transactions',
  vehicle: 'personal_expenses',
  'one-time': 'one_time_expenses',
  personal: 'personal_expenses',
  depreciation: 'depreciation_adjustment',
  other: 'other_adjustments',
}

const VALID_BACKEND_CATEGORIES = new Set(Object.keys(BACKEND_TO_FRONTEND_CATEGORY))

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isNormalizationItem(value: unknown): value is NormalizationItem {
  return isRecord(value) && typeof value.id === 'string'
}

export function mapBackendCategoryToFrontend(category: string): NormalizationItem['category'] {
  return BACKEND_TO_FRONTEND_CATEGORY[category] || 'other'
}

/**
 * Map a frontend category to its backend equivalent.
 * If `backendCategory` is provided (preserved from a prior load), it takes
 * priority so round-trips are lossless.
 */
export function mapFrontendCategoryToBackend(category: string, backendCategory?: string): string {
  if (backendCategory && VALID_BACKEND_CATEGORIES.has(backendCategory)) return backendCategory
  if (VALID_BACKEND_CATEGORIES.has(category)) return category
  return FRONTEND_TO_BACKEND_CATEGORY[category] || category
}

export function toBackendNormalizationCategory(
  category: string,
  backendCategory?: string
): NormalizationCategory {
  return mapFrontendCategoryToBackend(category, backendCategory) as NormalizationCategory
}

export function toConfidenceScore(value: unknown): ConfidenceScoreValue | undefined {
  return value === 'high' || value === 'medium' || value === 'low' ? value : undefined
}

export function markNormalizationReviewedIfImported(
  item: NormalizationItem,
  reviewedAt = new Date().toISOString()
): Partial<NormalizationItem> {
  return requiresIndividualImportedNormalizationReview(item) ? { reviewedAt } : {}
}

export function clearImportedNormalizationReview(item: NormalizationItem): Partial<NormalizationItem> {
  return requiresIndividualImportedNormalizationReview(item) ? { reviewedAt: undefined } : {}
}

export function addUniqueNormalizationItems(
  existing: NormalizationItem[],
  incoming: NormalizationItem[]
): NormalizationItem[] {
  return [...existing, ...incoming.filter((n) => !existing.some((e) => e.id === n.id))]
}

export function removeNormalizationItem(
  items: NormalizationItem[],
  id: string
): NormalizationItem[] {
  return items.filter((n) => n.id !== id)
}

export function updateNormalizationItem(
  items: NormalizationItem[],
  id: string,
  partial: Partial<NormalizationItem>
): NormalizationItem[] {
  return items.map((n) => (n.id === id ? { ...n, ...partial } : n))
}

export function acceptNormalizationItem(item: NormalizationItem): NormalizationItem {
  return {
    ...item,
    status: 'accepted' as NormalizationStatus,
    ...markNormalizationReviewedIfImported(item),
  }
}

export function rejectNormalizationItem(item: NormalizationItem): NormalizationItem {
  return {
    ...item,
    status: 'rejected' as NormalizationStatus,
    ...clearImportedNormalizationReview(item),
  }
}

export function acceptNormalizationItems(
  items: NormalizationItem[],
  ids: string[]
): NormalizationItem[] {
  return items.map((n) => {
    if (!ids.includes(n.id)) return n
    if (requiresIndividualImportedNormalizationReview(n) && n.status !== 'accepted') return n
    return acceptNormalizationItem(n)
  })
}

export function rejectNormalizationItems(
  items: NormalizationItem[],
  ids: string[]
): NormalizationItem[] {
  return items.map((n) => (ids.includes(n.id) ? rejectNormalizationItem(n) : n))
}

export function selectAcceptedNormalizations(items: NormalizationItem[]): NormalizationItem[] {
  return items.filter((n) => n.status === 'accepted')
}

export function selectPendingNormalizations(items: NormalizationItem[]): NormalizationItem[] {
  return items.filter((n) => n.status === 'pending')
}

export function selectRejectedNormalizations(items: NormalizationItem[]): NormalizationItem[] {
  return items.filter((n) => n.status === 'rejected')
}

export function selectNormalizationsByYear(
  items: NormalizationItem[],
  year: number
): NormalizationItem[] {
  return items.filter((n) => normalizationItemTouchesYear(n, year))
}

export function sumNormalizationAdjustments(items: NormalizationItem[]): number {
  return items.reduce((sum, n) => {
    const adj = Number(n.adjustment)
    return sum + (Number.isFinite(adj) ? adj : 0)
  }, 0)
}

export function computeNormalizedEbitda(
  originalEbitda: number,
  items: NormalizationItem[]
): number {
  const base = Number(originalEbitda)
  const safeBase = Number.isFinite(base) ? base : 0
  return safeBase + sumNormalizationAdjustments(selectAcceptedNormalizations(items))
}

export function extractSessionNormalizationItems(sessionData: unknown): NormalizationItem[] {
  if (!isRecord(sessionData)) return []
  const stored = (sessionData as SessionWithNormalizations)._normalizations
  if (!Array.isArray(stored) || stored.length === 0) return []
  return stored.filter(isNormalizationItem)
}

export function buildTitanNormalizationRequest({
  items,
  reportId,
  reportedEbitda,
  year,
}: {
  items: NormalizationItem[]
  reportId: string
  reportedEbitda?: number
  year: number
}): CreateNormalizationRequest {
  const rawEbitda = Number(reportedEbitda)
  const yearEbitda = Number.isFinite(rawEbitda) ? rawEbitda : 0
  const adjustments: PersistedNormalizationAdjustment[] = items
    .filter((n) => n.status === 'accepted' && appliesToYear(n, year))
    .map((n) => {
      const amount = getNormalizationAmountForBase(n, yearEbitda)
      return {
        category: toBackendNormalizationCategory(n.category, n.backendCategory),
        amount,
        note: n.reason,
        confidence: toConfidenceScore(n.confidence),
        ledger_code: n.ledgerCode || undefined,
        ledger_name: n.ledgerName || undefined,
        normalization_type: n.type,
        normalization_value: n.value,
        frontend_id: n.id,
        apply_years: n.applyYears,
        apply_all_years: n.applyAllYears,
      }
    })

  return {
    session_id: reportId,
    year,
    reported_ebitda: yearEbitda,
    adjustments,
  }
}

export function mapTitanNormalizationsToItems(
  responses: Pick<GetNormalizationResponse, 'year' | 'adjustments' | 'custom_adjustments'>[]
): NormalizationItem[] {
  const seenFrontendIds = new Map<string, NormalizationItem>()
  const items: NormalizationItem[] = []

  for (const resp of responses) {
    for (let idx = 0; idx < (resp.adjustments || []).length; idx++) {
      const adj = resp.adjustments[idx] as RestoredNormalizationAdjustment
      const restoredType = adj.normalization_type || (adj.amount >= 0 ? 'add' : 'subtract')
      const restoredValue = adj.normalization_value ?? Math.abs(adj.amount)

      if (adj.frontend_id && seenFrontendIds.has(adj.frontend_id)) continue

      const item: NormalizationItem = {
        id: adj.frontend_id || `titan-${resp.year}-${adj.category}-${idx}`,
        ledgerCode: adj.ledger_code || '',
        ledgerName: adj.ledger_name || adj.note || adj.category,
        category: mapBackendCategoryToFrontend(adj.category),
        backendCategory: adj.category,
        type: restoredType,
        value: restoredValue,
        adjustment: adj.amount,
        reason: adj.note,
        source: 'manual' as NormalizationSource,
        sourceRef: '',
        status: 'accepted' as NormalizationStatus,
        applyAllYears: adj.apply_all_years ?? false,
        applyYears: adj.apply_years,
        year: resp.year,
        confidence: toConfidenceScore(adj.confidence),
      }

      if (adj.frontend_id) seenFrontendIds.set(adj.frontend_id, item)
      items.push(item)
    }

    for (let idx = 0; idx < (resp.custom_adjustments || []).length; idx++) {
      const custom = resp.custom_adjustments[idx] as RestoredCustomAdjustment

      if (custom.frontend_id && seenFrontendIds.has(custom.frontend_id)) continue

      const item: NormalizationItem = {
        id: custom.frontend_id || custom.id || `titan-custom-${resp.year}-${idx}`,
        ledgerCode: custom.ledger_code || '',
        ledgerName: custom.ledger_name || custom.description,
        category: 'other',
        type: custom.normalization_type || (custom.amount >= 0 ? 'add' : 'subtract'),
        value: custom.normalization_value ?? Math.abs(custom.amount),
        adjustment: custom.amount,
        reason: custom.note,
        source: 'manual' as NormalizationSource,
        sourceRef: '',
        status: 'accepted' as NormalizationStatus,
        applyAllYears: custom.apply_all_years ?? false,
        applyYears: custom.apply_years,
        year: resp.year,
      }

      if (custom.frontend_id) seenFrontendIds.set(custom.frontend_id, item)
      items.push(item)
    }
  }

  return items
}
