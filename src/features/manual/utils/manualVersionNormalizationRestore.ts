import type {
  NormalizationItem,
  NormalizationSource,
  NormalizationType,
} from '@/components/calculator'
import { mapBackendCategoryToFrontend } from '@/store/normalizationStoreModel'
import { normalizationNumber } from '@/utils/normalizationAmount'

const FRONTEND_NORMALIZATION_CATEGORIES = new Set<NormalizationItem['category']>([
  'salary',
  'rent',
  'vehicle',
  'one-time',
  'personal',
  'depreciation',
  'other',
])

const NORMALIZATION_SOURCES = new Set<NormalizationSource>([
  'manual',
  'yuki',
  'exact',
  'silverfin',
  'bizzcontrol',
  'odoo',
  'octopus',
  'expertm',
  'accountable',
  'csv',
  'ai',
  'auto',
])

const NORMALIZATION_TYPES = new Set<NormalizationType>([
  'add',
  'subtract',
  'add_percent',
  'subtract_percent',
  'absolute',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function restoreNormalizationCategory(rawCategory: string): NormalizationItem['category'] {
  return FRONTEND_NORMALIZATION_CATEGORIES.has(rawCategory as NormalizationItem['category'])
    ? (rawCategory as NormalizationItem['category'])
    : mapBackendCategoryToFrontend(rawCategory)
}

function readNormalizationSource(value: unknown): NormalizationSource | undefined {
  return NORMALIZATION_SOURCES.has(value as NormalizationSource)
    ? (value as NormalizationSource)
    : undefined
}

function readNormalizationType(value: unknown): NormalizationType | undefined {
  return NORMALIZATION_TYPES.has(value as NormalizationType)
    ? (value as NormalizationType)
    : undefined
}

export function buildManualNormalizationsFromVersionSnapshot(
  normalizationData: unknown
): NormalizationItem[] {
  const snapshot = asRecord(normalizationData)
  if (!snapshot) return []

  const items: NormalizationItem[] = []
  for (const [yearKey, yearData] of Object.entries(snapshot)) {
    const year = Number(yearKey)
    const yearRecord = asRecord(yearData)
    const adjustments = yearRecord?.adjustments
    if (!/^\d{4}$/.test(yearKey) || year < 2000 || year > 2100 || !Array.isArray(adjustments))
      continue

    const seenIds = new Set<string>()
    const rows = [
      ...adjustments,
      ...(Array.isArray(yearRecord?.custom_adjustments) ? yearRecord.custom_adjustments : []),
    ]
    rows.forEach((rawAdjustment, index) => {
      const adjustmentRecord = asRecord(rawAdjustment)
      if (!adjustmentRecord) return

      const amount = normalizationNumber(adjustmentRecord.amount ?? adjustmentRecord.adjustment)
      const rawCategory = readString(adjustmentRecord.category) || ''
      const normalizationType =
        readNormalizationType(
          adjustmentRecord.normalization_type ?? adjustmentRecord.normalizationType
        ) || (amount >= 0 ? 'add' : 'subtract')
      const reviewedAt =
        readString(adjustmentRecord.reviewed_at) || readString(adjustmentRecord.reviewedAt)
      const confidence =
        adjustmentRecord.confidence === 'high' ||
        adjustmentRecord.confidence === 'medium' ||
        adjustmentRecord.confidence === 'low'
          ? adjustmentRecord.confidence
          : undefined

      const id =
        readString(adjustmentRecord.frontend_id) ||
        readString(adjustmentRecord.id) ||
        `version-${year}-${index}`
      const economicId = readString(adjustmentRecord.source_adjustment_id) || id
      if (seenIds.has(economicId))
        throw new Error(`Duplicate normalization adjustment: ${economicId}`)
      seenIds.add(economicId)
      const storedStatus = adjustmentRecord.status
      const status =
        storedStatus === 'accepted' || storedStatus === 'rejected' ? storedStatus : 'pending'

      items.push({
        id,
        ledgerCode:
          readString(adjustmentRecord.ledger_code) || readString(adjustmentRecord.ledgerCode) || '',
        ledgerName:
          readString(adjustmentRecord.ledger_name) ||
          readString(adjustmentRecord.ledgerName) ||
          readString(adjustmentRecord.note) ||
          readString(adjustmentRecord.description) ||
          rawCategory,
        category: restoreNormalizationCategory(rawCategory),
        backendCategory: rawCategory,
        type: normalizationType,
        value: normalizationNumber(
          adjustmentRecord.normalization_value ??
            adjustmentRecord.normalizationValue ??
            Math.abs(amount)
        ),
        adjustment: amount,
        reason: readString(adjustmentRecord.note) || readString(adjustmentRecord.reason),
        source: readNormalizationSource(adjustmentRecord.source) || 'manual',
        sourceRef:
          readString(adjustmentRecord.source_ref) ||
          readString(adjustmentRecord.sourceRef) ||
          'version',
        status,
        ...(readString(adjustmentRecord.source_adjustment_id)
          ? { sourceAdjustmentId: readString(adjustmentRecord.source_adjustment_id) }
          : {}),
        ...(adjustmentRecord.owner_role === 'working' || adjustmentRecord.owner_role === 'passive'
          ? { ownerRole: adjustmentRecord.owner_role }
          : {}),
        ...(adjustmentRecord.actual_owner_compensation !== undefined
          ? {
              actualOwnerCompensation: normalizationNumber(
                adjustmentRecord.actual_owner_compensation
              ),
            }
          : {}),
        ...(adjustmentRecord.replacement_owner_compensation !== undefined
          ? {
              replacementOwnerCompensation: normalizationNumber(
                adjustmentRecord.replacement_owner_compensation
              ),
            }
          : {}),
        ...(typeof adjustmentRecord.rule_version === 'string'
          ? { ruleVersion: adjustmentRecord.rule_version }
          : {}),
        ...(reviewedAt ? { reviewedAt } : {}),
        applyAllYears: false,
        year,
        ...(confidence ? { confidence } : {}),
      })
    })
  }

  // A multi-year economic adjustment needs distinct editable row identities.
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.id, (counts.get(item.id) ?? 0) + 1)
  return items.map((item) =>
    (counts.get(item.id) ?? 0) > 1
      ? {
          ...item,
          sourceAdjustmentId: item.sourceAdjustmentId ?? item.id,
          id: `${item.id}:${item.year}`,
        }
      : item
  )
}
