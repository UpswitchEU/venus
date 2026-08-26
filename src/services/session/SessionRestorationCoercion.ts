import type { NormalizationItem } from '../../components/calculator/UnifiedNormalizationTypes'
import type { ImportQualityPerYear } from '../../store/useImportQualityStore'
import type { ValuationFormData, ValuationResponse } from '../../types/valuation'
import type { FormSnapshotForRevenueNav } from '../../utils/currentYearRevenueForMethodNav'
import type { ImportedLedgerAnalysisLike } from '../../utils/importedLedgerNormalization'
import type { ImportedLedgerTaxLatencyAnalysisLike } from '../../utils/importedLedgerTaxLatencies'

export type UnknownRecord = Record<string, unknown>
export type ValuationResultWithAssets = ValuationResponse &
  UnknownRecord & {
    htmlReport?: string | null
    details?: { html_report?: string | null }
  }

type ImportedLedgerAnalysis = ImportedLedgerAnalysisLike & ImportedLedgerTaxLatencyAnalysisLike

export function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function asFormPatch(value: unknown): Partial<ValuationFormData> {
  return (asRecord(value) ?? {}) as unknown as Partial<ValuationFormData>
}

export function asFormSnapshotForRevenueNav(value: unknown): FormSnapshotForRevenueNav {
  return (asRecord(value) ?? {}) as unknown as FormSnapshotForRevenueNav
}

export function asValuationResultWithAssets(
  value: ValuationResponse | null | undefined
): ValuationResultWithAssets | null {
  return value ? (value as ValuationResultWithAssets) : null
}

export function asNormalizationItems(value: unknown): NormalizationItem[] {
  return Array.isArray(value) ? (value as unknown as NormalizationItem[]) : []
}

export function asImportQuality(value: unknown): Record<string, ImportQualityPerYear> | null {
  const record = asRecord(value)
  return record && Object.keys(record).length > 0
    ? (record as unknown as Record<string, ImportQualityPerYear>)
    : null
}

export function asImportedLedgerAnalysis(value: unknown): ImportedLedgerAnalysis | null {
  const record = asRecord(value)
  return record ? (record as unknown as ImportedLedgerAnalysis) : null
}
