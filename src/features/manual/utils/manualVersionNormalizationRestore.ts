import type { NormalizationItem } from '@/components/calculator'
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
        type: amount >= 0 ? 'add' : 'subtract',
        value: Math.abs(amount),
        adjustment: amount,
        reason: readString(adjustmentRecord.note) || readString(adjustmentRecord.reason),
        source: 'manual',
        sourceRef: 'version',
        status: 'accepted',
        applyAllYears: false,
        year,
      })
    })
  }

  return items
}
