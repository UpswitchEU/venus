import type {
  ValuationVersion as NavValuationVersion,
  ValuationReportData,
} from '@/components/calculator'
import type { ValuationVersion } from '@/types/ValuationVersion'
import { parseFinancialTransportNumber } from '@/utils/financialTransport'
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
  return parseFinancialTransportNumber(value) ?? null
}

function hasUsableNavPrices(prices: NavVersionPrices | null): boolean {
  return prices != null
}

function pricesFromCurrentSummary(
  summary: CurrentValuationSummary | undefined,
  report: ValuationReportData | null
): NavVersionPrices | null {
  if (report?.valueBasis === 'enterprise_value') return null
  if (summary) {
    const askPrice = finiteNumber(summary.askPrice)
    const min = finiteNumber(summary.priceRange?.min)
    const max = finiteNumber(summary.priceRange?.max)
    const valuation = finiteNumber(report?.valuation)
    if (askPrice != null && askPrice >= 0) {
      return {
        askPrice,
        priceRange:
          valuation != null && min != null && max != null && min <= valuation && valuation <= max
            ? { min, max }
            : undefined,
      }
    }
  }

  if (!report) return null

  const valuation = finiteNumber(report.valuation)
  if (valuation == null) return null
  const min = finiteNumber(report.valuationLow)
  const max = finiteNumber(report.valuationHigh)
  const recommendedAskingPrice = finiteNumber(report.recommendedAskingPrice)
  const askPrice =
    recommendedAskingPrice != null && recommendedAskingPrice >= 0
      ? recommendedAskingPrice
      : undefined
  return {
    askPrice,
    priceRange:
      min != null && max != null && min <= valuation && valuation <= max ? { min, max } : undefined,
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
        currency: report.currency,
        label: currentVersionLabel,
        priceRange: currentPrices?.priceRange,
        askPrice: currentPrices?.askPrice,
        ...(!currentPrices ? { pricesPending: true } : {}),
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
      isCurrentVersion && currentPrices && (!version.valuationResult || version.isSummary)
        ? currentPrices
        : versionPrices

    return {
      id: version.id,
      currency: version.valuationResult?.currency ?? (isCurrentVersion ? report?.currency : null),
      label: version.versionLabel,
      priceRange: prices?.priceRange,
      askPrice: prices?.askPrice,
      timestamp: version.createdAt,
      isActive: isCurrentVersion,
      ...(!hasUsableNavPrices(prices) && (!version.valuationResult || version.isSummary)
        ? { pricesPending: true }
        : {}),
    }
  })
}
