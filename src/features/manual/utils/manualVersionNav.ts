import type {
  ValuationVersion as NavValuationVersion,
  ValuationReportData,
} from '@/components/calculator'
import type { ValuationVersion } from '@/types/ValuationVersion'
import {
  deriveNavPricesForVersionNav,
  type NavVersionPrices,
} from '../components/manualReportPresentation'

type CurrentValuationSummary = {
  priceRange: { min: number; max: number }
  askPrice: number
} | null

export interface BuildManualVersionHistoryForNavParams {
  versions: ValuationVersion[]
  report: ValuationReportData | null
  selectedMethod: string
  currentVersionLabel: string
  currentValuationSummary?: CurrentValuationSummary
  activeVersionNumber?: number | null
}

function finiteNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function hasUsableNavPrices(prices: NavVersionPrices): boolean {
  return prices.askPrice > 0 || prices.priceRange.min > 0 || prices.priceRange.max > 0
}

function midpointFromRange(min: number | null, max: number | null): number | null {
  if (min == null || max == null || min <= 0 || max <= 0) return null
  return Math.round((min + max) / 2)
}

function pricesFromCurrentSummary(
  summary: CurrentValuationSummary | undefined,
  report: ValuationReportData | null
): NavVersionPrices | null {
  if (summary) {
    const askPrice = finiteNumber(summary.askPrice)
    const min = finiteNumber(summary.priceRange?.min)
    const max = finiteNumber(summary.priceRange?.max)
    if (askPrice != null && min != null && max != null) {
      const fallbackAsk = midpointFromRange(min, max)
      return {
        askPrice: askPrice > 0 ? askPrice : (fallbackAsk ?? askPrice),
        priceRange: { min, max },
      }
    }
  }

  if (!report) return null

  const valuation = finiteNumber(report.valuation) ?? 0
  const min = finiteNumber(report.valuationLow) ?? Math.round(valuation * 0.85)
  const max = finiteNumber(report.valuationHigh) ?? Math.round(valuation * 1.15)
  const recommendedAskingPrice = finiteNumber(report.recommendedAskingPrice)
  const askPrice =
    recommendedAskingPrice != null && recommendedAskingPrice > 0
      ? recommendedAskingPrice
      : valuation > 0
        ? valuation
        : (midpointFromRange(min, max) ?? valuation)
  return {
    askPrice,
    priceRange: { min, max },
  }
}

export function buildManualVersionHistoryForNav({
  versions,
  report,
  selectedMethod,
  currentVersionLabel,
  currentValuationSummary,
  activeVersionNumber,
}: BuildManualVersionHistoryForNavParams): NavValuationVersion[] {
  const currentPrices = pricesFromCurrentSummary(currentValuationSummary, report)
  const activeNumber = finiteNumber(activeVersionNumber)

  if (versions.length === 0 && report) {
    return [
      {
        id: 'current',
        label: currentVersionLabel,
        priceRange: currentPrices?.priceRange ?? {
          min: report.valuationLow ?? Math.round(report.valuation * 0.85),
          max: report.valuationHigh ?? Math.round(report.valuation * 1.15),
        },
        askPrice: currentPrices?.askPrice ?? report.recommendedAskingPrice ?? report.valuation,
        timestamp: report.generatedAt,
        isActive: true,
      },
    ]
  }

  return versions.map((version, index) => {
    const formData = version.formData as {
      selected_valuation_method?: string
      selected_method?: string
    }
    const method = formData.selected_valuation_method ?? formData.selected_method ?? selectedMethod
    const versionPrices = deriveNavPricesForVersionNav(version.valuationResult, method)
    const isCurrentVersion =
      activeNumber != null
        ? version.versionNumber === activeNumber
        : version.isActive || (versions.length === 1 && index === 0)
    const prices =
      isCurrentVersion &&
      currentPrices &&
      (!version.valuationResult || !hasUsableNavPrices(versionPrices))
        ? currentPrices
        : versionPrices

    return {
      id: version.id,
      label: version.versionLabel,
      priceRange: prices.priceRange,
      askPrice: prices.askPrice,
      timestamp: version.createdAt,
      isActive: isCurrentVersion,
    }
  })
}
