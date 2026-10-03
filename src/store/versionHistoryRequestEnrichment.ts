import type { CreateVersionRequest, ValuationVersion } from '../types/ValuationVersion'
import { FinancialDecimal as Decimal } from '../utils/financialDecimal'
import { parseFinancialTransportNumber } from '../utils/financialTransport'
import {
  getCurrentFilingYear,
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../utils/fiscalYear'
import { normalizeImportedLedgerReviewStatuses } from '../utils/importedLedgerNormalization'
import {
  getNormalizationAmountForBase,
  getNormalizationTargetYears,
} from '../utils/normalizationMath'
import { mapFrontendCategoryToBackend, useNormalizationStore } from './useNormalizationStore'
import { useTaxLatencyStore } from './useTaxLatencyStore'

interface VersionRequestEnrichmentEvents {
  onNormalizationCaptured?: (payload: { reportId: string; years: string[] }) => void
  onTaxLatencyCaptured?: (payload: { count: number; reportId: string }) => void
}

type VersionCurrentYearData = {
  ebitda?: number
  reported_ebitda?: number
  ebitda_normalization_metadata?: { reported_ebitda?: number }
  year?: number
}

function buildVersionSnapshotNormalizationData(
  request: CreateVersionRequest
): ValuationVersion['normalization_data'] | undefined {
  const rawItems = useNormalizationStore.getState().items
  if (rawItems.length === 0) return undefined

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
  const yearEbitdaMap: Record<number, number> = {}

  normalizedHistoricalYearData?.forEach((y) => {
    const yearMeta = y?.ebitda_normalization_metadata
    const reported = parseFinancialTransportNumber(
      y.reported_ebitda ?? yearMeta?.reported_ebitda ?? y.ebitda
    )
    if (reported !== undefined) {
      yearEbitdaMap[Number(y.year)] = reported
    }
  })
  // Explicit current-period evidence takes precedence over a duplicate history row.
  const currentReported = parseFinancialTransportNumber(
    currentYearData?.reported_ebitda ??
      currentYearData?.ebitda_normalization_metadata?.reported_ebitda ??
      currentYearData?.ebitda
  )
  delete yearEbitdaMap[currentYear]
  if (currentReported !== undefined) yearEbitdaMap[currentYear] = currentReported

  const allDataYearsSet = new Set(allDataYears)
  const accepted = normalizeImportedLedgerReviewStatuses(rawItems, yearEbitdaMap).filter(
    (n) => n.status === 'accepted'
  )
  if (accepted.length === 0) return undefined

  const yearGroups: Record<number, typeof accepted> = {}
  for (const item of accepted) {
    const yearsToApply = getNormalizationTargetYears(item, allDataYears)
    for (const year of yearsToApply) {
      if (!allDataYearsSet.has(year) || yearEbitdaMap[year] === undefined) continue
      if (!yearGroups[year]) yearGroups[year] = []
      yearGroups[year].push(item)
    }
  }

  const normalizationData: ValuationVersion['normalization_data'] = {}
  Object.entries(yearGroups).forEach(([year, items]) => {
    const reportedEbitda = yearEbitdaMap[Number(year)]
    const totalAdjustment = items
      .reduce(
        (sum, item) => sum.plus(getNormalizationAmountForBase(item, reportedEbitda)),
        new Decimal(0)
      )
      .toNumber()
    normalizationData[year] = {
      reported_ebitda: reportedEbitda,
      normalized_ebitda: new Decimal(reportedEbitda).plus(totalAdjustment).toNumber(),
      total_adjustments: totalAdjustment,
      adjustments: items.map((item) => ({
        category: mapFrontendCategoryToBackend(item.category, item.backendCategory),
        amount: getNormalizationAmountForBase(item, reportedEbitda),
        note: item.reason,
        confidence: item.confidence,
        ledger_code: item.ledgerCode || undefined,
        ledger_name: item.ledgerName || undefined,
        source: item.source,
        source_ref: item.sourceRef || undefined,
        reviewed_at: item.reviewedAt,
        frontend_id: item.id,
        normalization_type: item.type,
        normalization_value: item.value,
        apply_all_years: item.applyAllYears,
        apply_years: getNormalizationTargetYears(item, allDataYears),
        rule_version: item.ruleVersion,
        owner_role: item.ownerRole,
        actual_owner_compensation: item.actualOwnerCompensation,
        replacement_owner_compensation: item.replacementOwnerCompensation,
      })),
      custom_adjustments: [],
      confidence_score: items[0]?.confidence || 'medium',
      ...(reportedEbitda !== 0
        ? {
            adjustment_percentage: new Decimal(totalAdjustment)
              .div(reportedEbitda)
              .mul(100)
              .toNumber(),
          }
        : {}),
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
