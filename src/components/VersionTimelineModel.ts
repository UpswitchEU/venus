import type { ValuationVersion } from '../types/ValuationVersion'
import {
  getEquityValueHigh,
  getEquityValueLow,
  getEquityValueMid,
  getFinalValuation,
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
  currentValuation: number
  equityValueLow: number
  equityValueMid: number
  equityValueHigh: number
  recommendedAskingPrice: number
  premiumPercent: number
}

export interface VersionTimelineItemModel {
  currentValuation: number | null
  previousValuation: number | null
  priceChange: number
  priceChangePercent: number
  hasChanges: boolean
  normalizedYearsCount: number
  hasNormalizedEbitda: boolean
  valuationCard: VersionTimelineValuationCardModel | null
}

export function positiveFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
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

  const equityValueLow = positiveFiniteNumber(getEquityValueLow(valuationResult)) ?? 0
  const equityValueMid =
    positiveFiniteNumber(getEquityValueMid(valuationResult)) ?? currentValuation
  const equityValueHigh = positiveFiniteNumber(getEquityValueHigh(valuationResult)) ?? 0
  const recommendedAskingPrice =
    positiveFiniteNumber(getRecommendedAskingPrice(valuationResult)) ?? 0
  const premiumPercent =
    recommendedAskingPrice && equityValueMid
      ? Math.round(((recommendedAskingPrice - equityValueMid) / equityValueMid) * 100)
      : 0

  return {
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
  const currentValuation = positiveFiniteNumber(getFinalValuation(version.valuationResult))
  const previousValuation = previousVersion
    ? positiveFiniteNumber(getFinalValuation(previousVersion.valuationResult))
    : null
  const priceChange =
    currentValuation !== null && previousValuation !== null
      ? currentValuation - previousValuation
      : 0
  const priceChangePercent =
    currentValuation !== null && previousValuation !== null
      ? ((currentValuation - previousValuation) / previousValuation) * 100
      : 0
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
