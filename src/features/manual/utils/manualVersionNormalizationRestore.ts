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
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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
  const groups = new Map<string, NormalizationItem>()
  for (const [yearKey, yearData] of Object.entries(snapshot)) {
    const year = Number(yearKey)
    const yearRecord = asRecord(yearData)
    if (!/^\d{4}$/.test(yearKey) || year < 2000 || year > 2100 || !yearRecord) continue
    const adjustments = [
      ...(Array.isArray(yearRecord.adjustments) ? yearRecord.adjustments : []),
      ...(Array.isArray(yearRecord.custom_adjustments)
        ? yearRecord.custom_adjustments.filter((raw) => {
            const item = asRecord(raw)
            if (!item) return false
            try {
              normalizationNumber(item.amount ?? item.adjustment)
              return true
            } catch {
              // Legacy custom rows without a valid amount cannot become priced adjustments.
              return false
            }
          })
        : []),
    ]

    const seenIds = new Set<string>()
    adjustments.forEach((rawAdjustment, index) => {
      const adjustmentRecord = asRecord(rawAdjustment)
      if (!adjustmentRecord) return

      const amount = normalizationNumber(adjustmentRecord.amount ?? adjustmentRecord.adjustment)
      const rawCategory = readString(adjustmentRecord.category) || ''
      const savedType =
        readNormalizationType(
          adjustmentRecord.normalization_type ?? adjustmentRecord.normalizationType
        ) || (amount >= 0 ? 'add' : 'subtract')
      const savedValue = adjustmentRecord.normalization_value ?? adjustmentRecord.normalizationValue
      // A monetary delta does not tell us the original percentage or absolute target.
      // Legacy snapshots without that instruction retain their accepted annual delta.
      const normalizationType =
        savedValue == null &&
        (savedType === 'add_percent' ||
          savedType === 'subtract_percent' ||
          savedType === 'absolute')
          ? amount >= 0
            ? 'add'
            : 'subtract'
          : savedType
      const reviewedAt =
        readString(adjustmentRecord.reviewed_at) || readString(adjustmentRecord.reviewedAt)
      const confidence =
        adjustmentRecord.confidence === 'high' ||
        adjustmentRecord.confidence === 'medium' ||
        adjustmentRecord.confidence === 'low'
          ? adjustmentRecord.confidence
          : undefined
      const value = normalizationNumber(savedValue ?? Math.abs(amount))
      const frontendId = readString(adjustmentRecord.frontend_id) || readString(adjustmentRecord.id)
      const id = frontendId || `version-${year}-${index}`
      const economicId = readString(adjustmentRecord.source_adjustment_id) || id
      if (seenIds.has(economicId))
        throw new Error(`Duplicate normalization adjustment: ${economicId}`)
      seenIds.add(economicId)
      const ownerRole = adjustmentRecord.owner_role
      const actualCompensation =
        adjustmentRecord.actual_owner_compensation == null
          ? undefined
          : normalizationNumber(adjustmentRecord.actual_owner_compensation)
      const replacementCompensation =
        adjustmentRecord.replacement_owner_compensation == null
          ? undefined
          : normalizationNumber(adjustmentRecord.replacement_owner_compensation)
      const ruleVersion = readString(adjustmentRecord.rule_version)

      const item: NormalizationItem = {
        id,
        ...(frontendId ? { sourceAdjustmentId: economicId } : {}),
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
        value,
        adjustment: amount,
        reason: readString(adjustmentRecord.note) || readString(adjustmentRecord.reason),
        source: readNormalizationSource(adjustmentRecord.source) || 'manual',
        sourceRef:
          readString(adjustmentRecord.source_ref) || readString(adjustmentRecord.sourceRef),
        status:
          adjustmentRecord.status === 'rejected'
            ? 'rejected'
            : adjustmentRecord.status === 'accepted'
              ? 'accepted'
              : 'pending',
        ...(reviewedAt ? { reviewedAt } : {}),
        // Annual snapshots are the evidence of scope; do not price absent years merely
        // because a legacy row claims them in apply_years.
        applyAllYears: adjustmentRecord.apply_all_years === true,
        ...(frontendId ? { applyYears: [year] } : {}),
        year,
        ...(confidence ? { confidence } : {}),
        ...(ownerRole === 'working' || ownerRole === 'passive' ? { ownerRole } : {}),
        ...(actualCompensation !== undefined
          ? { actualOwnerCompensation: actualCompensation }
          : {}),
        ...(replacementCompensation !== undefined
          ? { replacementOwnerCompensation: replacementCompensation }
          : {}),
        ...(ruleVersion ? { ruleVersion } : {}),
      }
      // The same reviewed percentage/absolute instruction has a different annual
      // delta on different reported baselines. Group the instruction, not its delta.
      const { year: _year, applyYears: _years, adjustment, ...instruction } = item
      const variableDelta =
        item.type === 'add_percent' || item.type === 'subtract_percent' || item.type === 'absolute'
      const key = JSON.stringify({ ...instruction, ...(variableDelta ? {} : { adjustment }) })
      const existing = frontendId ? groups.get(key) : undefined
      if (existing) {
        existing.applyYears = [
          ...new Set([...(existing.applyYears ?? [existing.year]), year]),
        ].sort((a, b) => a - b)
      } else {
        // Distinct instructions sharing a corrupt legacy id must remain independently
        // addressable, so changing one review decision cannot change both.
        if (items.some((previous) => previous.id === item.id))
          item.id = `${item.id}:${year}:${index}`
        items.push(item)
        if (frontendId) groups.set(key, item)
      }
    })
  }

  return items
}
