import type { ManualValuationFormData } from '../../../types/valuation'
import { realEstateCarveOutAppliesTo } from '../../../utils/realEstateCarveOutDisplay'

type ManualRealEstateCarveOutFields = Pick<
  ManualValuationFormData,
  | 'estimated_market_rent'
  | 'exclude_real_estate'
  | 'real_estate_book_value'
  | 'real_estate_market_value'
  | 'real_estate_treatment'
>

export function hasManualRealEstateCarveOutData(formData: ManualRealEstateCarveOutFields): boolean {
  return (
    formData.real_estate_treatment === 'carve_out' ||
    formData.real_estate_treatment === 'included' ||
    Boolean(formData.exclude_real_estate) ||
    formData.real_estate_market_value != null ||
    formData.real_estate_book_value != null ||
    formData.estimated_market_rent != null
  )
}

export function shouldShowManualRealEstateCarveOut({
  effectiveMethods,
  formData,
}: {
  effectiveMethods: readonly string[] | undefined | null
  formData: ManualRealEstateCarveOutFields
}): boolean {
  return realEstateCarveOutAppliesTo(effectiveMethods) || hasManualRealEstateCarveOutData(formData)
}
