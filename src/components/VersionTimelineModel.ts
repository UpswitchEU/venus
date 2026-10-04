import type { ValuationVersion } from '../types/ValuationVersion'
import { parseFinancialTransportNumber } from '../utils/financialTransport'
import {
  financialResultsComparable,
  getEquityValueHigh,
  getEquityValueLow,
  getEquityValueMid,
  getFinalValuation,
  getFinancialValueBasis,
  getRecommendedAskingPrice,
} from '../utils/valuationResultAccess'
import { buildVersionDisplayList } from '../utils/versionDisplayModel'

export const VERSION_TIMELINE_PAGE_SIZE = 10

export interface VersionTimelineListModel {
  sortedVersions: ValuationVersion[]
  displayedVersions: ValuationVersion[]
  hasMoreToShow: boolean
  hasMoreToFetch: boolean
  totalCount: number
}

export interface VersionTimelineValuationCardModel {
  currency?: string | null
  currentValuation: number
  equityValueLow: number | null
  equityValueMid: number
  equityValueHigh: number | null
  recommendedAskingPrice: number | null
  premiumPercent: number
}

export interface VersionTimelineItemModel {
  currentValuation: number | null
  previousValuation: number | null
  priceChange: number
  priceChangePercent: number | null
  hasChanges: boolean
  normalizedYearsCount: number
  hasNormalizedEbitda: boolean
  valuationCard: VersionTimelineValuationCardModel | null
}

export function positiveFiniteNumber(value: unknown): number | null {
  const numeric = parseFinancialTransportNumber(value)
  return numeric != null && numeric > 0 ? numeric : null
}

export function buildSortedTimelineVersions(
  versions: readonly ValuationVersion[]
): ValuationVersion[] {
  return buildVersionDisplayList(versions, { deduplicateIds: true, sort: 'desc' })
}

export function buildVersionTimelineListModel({
  versions,
  displayCount,
  totalVersions,
}: {
  versions: readonly ValuationVersion[]
  displayCount: number
  totalVersions?: number
}): VersionTimelineListModel {
  const sortedVersions = buildSortedTimelineVersions(versions)
  const visibleCount = Math.max(0, Math.trunc(displayCount))
  const totalCount = totalVersions ?? sortedVersions.length

  return {
    sortedVersions,
    displayedVersions: sortedVersions.slice(0, visibleCount),
    hasMoreToShow: sortedVersions.length > visibleCount,
    hasMoreToFetch: totalCount > sortedVersions.length,
    totalCount,
  }
}

function buildValuationCardModel(
  valuationResult: ValuationVersion['valuationResult'],
  currentValuation: number | null
): VersionTimelineValuationCardModel | null {
  if (!valuationResult || currentValuation === null) return null
  if (getFinancialValueBasis(valuationResult) === 'enterprise_value') return null

  const rawLow = getEquityValueLow(valuationResult)
  const equityValueMid = getEquityValueMid(valuationResult) ?? currentValuation
  const rawHigh = getEquityValueHigh(valuationResult)
  const coherentBand =
    rawLow != null && rawHigh != null && rawLow <= equityValueMid && equityValueMid <= rawHigh
  const equityValueLow = coherentBand ? rawLow : null
  const equityValueHigh = coherentBand ? rawHigh : null
  const recommendedAskingPrice = getRecommendedAskingPrice(valuationResult)
  const premiumPercent =
    recommendedAskingPrice != null && equityValueMid > 0
      ? Math.round(((recommendedAskingPrice - equityValueMid) / equityValueMid) * 100)
      : 0

  return {
    currency: valuationResult.currency,
    currentValuation,
    equityValueLow,
    equityValueMid,
    equityValueHigh,
    recommendedAskingPrice,
    premiumPercent,
  }
}

function normalizedYearsCount(version: ValuationVersion): number {
  const normalizedYears = version.changeMetadata?.normalized_years
  return Array.isArray(normalizedYears) ? normalizedYears.length : 0
}

export function buildVersionTimelineItemModel({
  previousVersion,
  version,
}: {
  version: ValuationVersion
  previousVersion: ValuationVersion | null
}): VersionTimelineItemModel {
  const currentValuation = getFinalValuation(version.valuationResult)
  const previousValuation = previousVersion
    ? getFinalValuation(previousVersion.valuationResult)
    : null
  const comparable = financialResultsComparable(
    version.valuationResult,
    previousVersion?.valuationResult
  )
  const priceChange =
    comparable && currentValuation !== null && previousValuation !== null
      ? currentValuation - previousValuation
      : 0
  const priceChangePercent =
    comparable && currentValuation !== null && previousValuation !== null && previousValuation > 0
      ? ((currentValuation - previousValuation) / previousValuation) * 100
      : null
  const ebitdaYearsCount = normalizedYearsCount(version)

  return {
    currentValuation,
    previousValuation,
    priceChange,
    priceChangePercent,
    hasChanges: !!version.changesSummary && version.changesSummary.totalChanges > 0,
    normalizedYearsCount: ebitdaYearsCount,
    hasNormalizedEbitda: ebitdaYearsCount > 0,
    valuationCard: buildValuationCardModel(version.valuationResult, currentValuation),
  }
}
