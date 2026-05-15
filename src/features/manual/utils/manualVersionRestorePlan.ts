import type { NormalizationItem } from '@/components/calculator'
import type { TaxLatencyCandidate, TaxLatencyItem } from '@/store/useTaxLatencyStore'
import type { ValuationRequest, ValuationResponse } from '@/types/valuation'
import { getFirstRenderableReportHtml } from '@/utils/safetyNetReportHtml'
import { buildManualNormalizationsFromVersionSnapshot } from './manualVersionNormalizationRestore'
import { buildManualTaxLatencyCandidatesFromVersionFormData } from './manualVersionTaxLatencyRestore'

export interface ManualVersionRestorePlan {
  versionNumber?: number
  formData?: ValuationRequest
  valuationResult?: ValuationResponse
  normalizations: NormalizationItem[]
  taxLatencyItems: TaxLatencyItem[]
  taxLatencyCandidates: TaxLatencyCandidate[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readVersionNumber(version: Record<string, unknown>): number | undefined {
  const raw = version.versionNumber ?? version.version
  const numeric = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(numeric) ? numeric : undefined
}

export function buildManualVersionRestorePlan(version: unknown): ManualVersionRestorePlan | null {
  const versionRecord = asRecord(version)
  if (!versionRecord) return null

  const formData = asRecord(versionRecord.formData)
    ? (versionRecord.formData as ValuationRequest)
    : undefined
  const valuationResultRecord = asRecord(versionRecord.valuationResult)
  const valuationResult = valuationResultRecord
    ? ({
        ...valuationResultRecord,
        html_report: getFirstRenderableReportHtml(
          valuationResultRecord.html_report,
          versionRecord.htmlReport
        ),
      } as ValuationResponse)
    : undefined

  return {
    versionNumber: readVersionNumber(versionRecord),
    formData,
    valuationResult,
    normalizations: buildManualNormalizationsFromVersionSnapshot(versionRecord.normalization_data),
    taxLatencyItems: Array.isArray(versionRecord.tax_latency_data)
      ? (versionRecord.tax_latency_data as TaxLatencyItem[])
      : [],
    taxLatencyCandidates: buildManualTaxLatencyCandidatesFromVersionFormData(formData),
  }
}
