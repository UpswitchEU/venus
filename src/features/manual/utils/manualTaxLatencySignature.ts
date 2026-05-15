import type { TaxLatencyItem } from '@/store/useTaxLatencyStore'

export function buildManualTaxLatencySignature(items: TaxLatencyItem[]): string {
  return JSON.stringify(
    items
      .map((item) => ({
        id: item.id,
        type: item.type,
        temporaryDifference: item.temporaryDifference,
        taxRate: item.taxRate,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  )
}
