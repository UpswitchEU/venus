import type {
  NormalizationItem,
  NormalizationSource,
  NormalizationType,
} from '@/components/calculator'
import { mapBackendCategoryToFrontend } from '@/store/useNormalizationStore'

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

function readFiniteNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
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
    if (!Number.isFinite(year) || !Array.isArray(adjustments)) continue

    adjustments.forEach((rawAdjustment, index) => {
      const adjustmentRecord = asRecord(rawAdjustment)
      if (!adjustmentRecord) return

      const amount = readFiniteNumber(adjustmentRecord.amount ?? adjustmentRecord.adjustment)
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

      items.push({
        id: `version-${year}-${index}`,
        ledgerCode:
          readString(adjustmentRecord.ledger_code) || readString(adjustmentRecord.ledgerCode) || '',
        ledgerName:
          readString(adjustmentRecord.ledger_name) ||
          readString(adjustmentRecord.ledgerName) ||
          readString(adjustmentRecord.note) ||
          rawCategory,
        category: restoreNormalizationCategory(rawCategory),
        backendCategory: rawCategory,
        type: normalizationType,
        value: readFiniteNumber(
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
        status: 'accepted',
        ...(reviewedAt ? { reviewedAt } : {}),
        applyAllYears: false,
        year,
        ...(confidence ? { confidence } : {}),
      })
    })
  }

  return items
}
