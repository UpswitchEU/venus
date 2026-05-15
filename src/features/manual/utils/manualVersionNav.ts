import type {
  ValuationVersion as NavValuationVersion,
  ValuationReportData,
} from '@/components/calculator'
import type { ValuationVersion } from '@/types/ValuationVersion'
import { deriveNavPricesForVersionNav } from '../components/manualReportPresentation'

export interface BuildManualVersionHistoryForNavParams {
  versions: ValuationVersion[]
  report: ValuationReportData | null
  selectedMethod: string
  currentVersionLabel: string
}

export function buildManualVersionHistoryForNav({
  versions,
  report,
  selectedMethod,
  currentVersionLabel,
}: BuildManualVersionHistoryForNavParams): NavValuationVersion[] {
  if (versions.length === 0 && report) {
    return [
      {
        id: 'current',
        label: currentVersionLabel,
        priceRange: {
          min: report.valuationLow ?? Math.round(report.valuation * 0.85),
          max: report.valuationHigh ?? Math.round(report.valuation * 1.15),
        },
        askPrice: report.recommendedAskingPrice ?? report.valuation,
        timestamp: report.generatedAt,
        isActive: true,
      },
    ]
  }

  return versions.map((version) => {
    const formData = version.formData as {
      selected_valuation_method?: string
      selected_method?: string
    }
    const method = formData.selected_valuation_method ?? formData.selected_method ?? selectedMethod
    const { priceRange, askPrice } = deriveNavPricesForVersionNav(version.valuationResult, method)

    return {
      id: version.id,
      label: version.versionLabel,
      priceRange,
      askPrice,
      timestamp: version.createdAt,
      isActive: version.isActive,
    }
  })
}
