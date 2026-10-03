import type { CreateVersionRequest } from '../types/ValuationVersion'
import { useNormalizationStore } from './useNormalizationStore'
import { useTaxLatencyStore } from './useTaxLatencyStore'
import { buildVersionNormalizationSnapshot } from './versionNormalizationSnapshot'

interface VersionRequestEnrichmentEvents {
  onNormalizationCaptured?: (payload: { reportId: string; years: string[] }) => void
  onTaxLatencyCaptured?: (payload: { count: number; reportId: string }) => void
}

export function enrichCreateVersionRequestFromStores(
  request: CreateVersionRequest,
  events: VersionRequestEnrichmentEvents = {}
): CreateVersionRequest {
  const enrichedRequest = { ...request }

  if (!enrichedRequest.normalization_data) {
    const normalizationData = buildVersionNormalizationSnapshot(
      enrichedRequest,
      useNormalizationStore.getState().items
    )
    if (normalizationData) {
      enrichedRequest.normalization_data = normalizationData
      events.onNormalizationCaptured?.({
        reportId: request.reportId,
        years: Object.keys(normalizationData),
      })
    }
  }

  if (!enrichedRequest.tax_latency_data) {
    const taxLatencyItems = useTaxLatencyStore.getState().items
    if (taxLatencyItems.length > 0) {
      enrichedRequest.tax_latency_data = taxLatencyItems
      events.onTaxLatencyCaptured?.({
        reportId: request.reportId,
        count: taxLatencyItems.length,
      })
    }
  }

  return enrichedRequest
}
