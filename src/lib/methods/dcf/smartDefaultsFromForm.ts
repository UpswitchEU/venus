/**
 * Bridge between the manual form state and `deriveDcfSmartDefaults`.
 *
 * Owned by the DCF method module so consumers (the forecast-sync hook,
 * the projection preview recomputations in `ManualInputPanel`) all read
 * smart defaults the same way. Resolving the business-category from
 * `industry` first then `businessType` keeps the smart-defaults aligned
 * with the WACC band classification rules.
 */

import { deriveDcfSmartDefaults } from '@/components/calculator/sections/dcfSmartDefaults'
import type { ManualValuationFormData } from '@/types/valuation'

type DcfFormSlice = Pick<ManualValuationFormData, 'yearlyFinancials' | 'industry' | 'businessType'>

export function dcfSmartDefaultsFromForm(formSlice: DcfFormSlice) {
  return deriveDcfSmartDefaults({
    yearlyFinancials: formSlice.yearlyFinancials,
    businessCategory: formSlice.industry || formSlice.businessType,
  })
}
