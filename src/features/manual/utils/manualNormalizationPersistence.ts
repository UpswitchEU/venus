import type { NormalizationItem } from '@/components/calculator'

export type ManualNormalizationYearItem = Pick<NormalizationItem, 'year'> &
  Partial<Pick<NormalizationItem, 'applyAllYears' | 'applyYears'>>

export type ManualNormalizationSignatureItem = Pick<
  NormalizationItem,
  'id' | 'type' | 'status' | 'year'
> &
  Partial<Pick<NormalizationItem, 'value' | 'adjustment' | 'applyAllYears' | 'applyYears'>>

export function getManualNormalizationYearsToPersist(
  item: ManualNormalizationYearItem,
  financialYears: number[]
): number[] {
  if (item.applyAllYears) return financialYears
  if (item.applyYears?.length) return item.applyYears
  return [item.year]
}

export function buildAcceptedNormalizationSignature(
  items: ManualNormalizationSignatureItem[]
): string {
  return JSON.stringify(
    items
      .filter((item) => item.status === 'accepted')
      .map((item) => ({
        id: item.id,
        type: item.type,
        value: item.value,
        adjustment: item.adjustment,
        year: item.year,
        applyAllYears: item.applyAllYears,
        applyYears: item.applyYears ?? [],
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  )
}

export interface BuildManualNormalizationPersistenceYearsParams {
  financialYears: number[]
  previousItems: ManualNormalizationYearItem[]
  nextItems: ManualNormalizationYearItem[]
}

export function buildManualNormalizationPersistenceYears({
  financialYears,
  previousItems,
  nextItems,
}: BuildManualNormalizationPersistenceYearsParams): number[] {
  return Array.from(
    new Set([
      ...financialYears,
      ...previousItems.flatMap((item) =>
        getManualNormalizationYearsToPersist(item, financialYears)
      ),
      ...nextItems.flatMap((item) => getManualNormalizationYearsToPersist(item, financialYears)),
    ])
  ).filter((year) => Number.isFinite(year))
}
