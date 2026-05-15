import type { TaxLatencyCandidate } from '@/store/useTaxLatencyStore'
import {
  buildTaxLatencyCandidatesFromImportedLedgerAnalysis,
  type ImportedLedgerTaxLatencyAnalysisLike,
} from '@/utils/importedLedgerTaxLatencies'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function buildManualTaxLatencyCandidatesFromVersionFormData(
  formData: unknown
): TaxLatencyCandidate[] {
  const formRecord = asRecord(formData)
  const businessContext = asRecord(formRecord?.business_context)
  const importedLedgerAnalysis = asRecord(businessContext?._imported_ledger_analysis)
  if (!importedLedgerAnalysis) return []

  return buildTaxLatencyCandidatesFromImportedLedgerAnalysis(
    importedLedgerAnalysis as ImportedLedgerTaxLatencyAnalysisLike
  )
}
