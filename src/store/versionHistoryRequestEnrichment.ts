import { coalesceFiniteNumber } from '../lib/omniPreview'
import type { CreateVersionRequest, ValuationVersion } from '../types/ValuationVersion'
import {
  getCurrentFilingYear,
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../utils/fiscalYear'
import { getNormalizationAmountForBase } from '../utils/normalizationMath'
import { mapFrontendCategoryToBackend, useNormalizationStore } from './useNormalizationStore'
import { useTaxLatencyStore } from './useTaxLatencyStore'

interface VersionRequestEnrichmentEvents {
  onNormalizationCaptured?: (payload: { reportId: string; years: string[] }) => void
  onTaxLatencyCaptured?: (payload: { count: number; reportId: string }) => void
}

type VersionCurrentYearData = {
  ebitda?: number
  ebitda_normalization_metadata?: { reported_ebitda?: number }
  year?: number
}

function buildVersionSnapshotNormalizationData(
  request: CreateVersionRequest
): ValuationVersion['normalization_data'] | undefined {
  const accepted = useNormalizationStore.getState().items.filter((n) => n.status === 'accepted')
  if (accepted.length === 0) return undefined

  const normalizedHistoricalYearData = normalizeHistoricalYearsForFiling(
    request.formData?.historical_years_data,
    request.formData?.filing_year_confirmed
  )
  const historicalYears =
    normalizedHistoricalYearData
      ?.filter((y) => y.ebitda != null && Number(y.year) >= 2000 && Number(y.year) <= 2100)
      .map((y) => Number(y.year)) ?? []
  const currentYearData = request.formData?.current_year_data as VersionCurrentYearData | undefined
  const currentYear = currentYearData?.year
    ? normalizeCurrentYearForFiling(currentYearData.year, request.formData?.filing_year_confirmed)
    : getCurrentFilingYear()
  const allDataYears = Array.from(new Set([currentYear, ...historicalYears]))
  const yearEbitdaMap: Record<number, number> = {
    [currentYear]: coalesceFiniteNumber(
      currentYearData?.ebitda_normalization_metadata?.reported_ebitda ??
        currentYearData?.ebitda ??
        0
    ),
  }

  normalizedHistoricalYearData?.forEach((y) => {
    const yearMeta = y?.ebitda_normalization_metadata
    if (y?.ebitda != null && y?.year != null) {
      yearEbitdaMap[Number(y.year)] = coalesceFiniteNumber(
        yearMeta?.reported_ebitda ?? y.ebitda ?? 0
      )
    }
  })

  const yearGroups: Record<number, typeof accepted> = {}
  for (const item of accepted) {
    const yearsToApply: number[] = item.applyAllYears
      ? allDataYears
      : item.applyYears && item.applyYears.length > 0
        ? item.applyYears
        : [item.year]
    for (const year of yearsToApply) {
      if (!yearGroups[year]) yearGroups[year] = []
      yearGroups[year].push(item)
    }
  }

  const normalizationData: ValuationVersion['normalization_data'] = {}
  Object.entries(yearGroups).forEach(([year, items]) => {
    const reportedEbitda = Number(yearEbitdaMap[Number(year)] ?? 0) || 0
    const totalAdjustment = items.reduce(
      (sum, item) => sum + getNormalizationAmountForBase(item, reportedEbitda),
      0
    )
    normalizationData[year] = {
      reported_ebitda: reportedEbitda,
      normalized_ebitda: reportedEbitda + totalAdjustment,
      total_adjustments: totalAdjustment,
      adjustments: items.map((item) => ({
        category: mapFrontendCategoryToBackend(item.category, item.backendCategory),
        amount: getNormalizationAmountForBase(item, reportedEbitda),
        note: item.reason,
        ledger_code: item.ledgerCode || undefined,
        ledger_name: item.ledgerName || undefined,
      })),
      custom_adjustments: [],
      confidence_score: items[0]?.confidence || 'medium',
      adjustment_percentage: reportedEbitda !== 0 ? (totalAdjustment / reportedEbitda) * 100 : 0,
    }
  })

  return Object.keys(normalizationData).length > 0 ? normalizationData : undefined
}

export function enrichCreateVersionRequestFromStores(
  request: CreateVersionRequest,
  events: VersionRequestEnrichmentEvents = {}
): CreateVersionRequest {
  const enrichedRequest = { ...request }

  if (!enrichedRequest.normalization_data) {
    const normalizationData = buildVersionSnapshotNormalizationData(enrichedRequest)
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
