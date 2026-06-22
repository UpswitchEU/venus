import type { ValuationFormData, ValuationRequest } from '../../types/valuation'
import type { NormalizationItem } from '../calculator/UnifiedNormalizationTypes'
import { getNumberRecordValue, getYearlyFinancials } from './utils/recordAccess'

export function hasRecentAcceptedNormalizations({
  normalizationItems,
  lastFullYear,
  hasLegacyNormalization,
}: {
  normalizationItems: readonly NormalizationItem[]
  lastFullYear: number
  hasLegacyNormalization: (year: number) => boolean
}): boolean {
  const yearsInVersionWindow = [lastFullYear, lastFullYear - 1, lastFullYear - 2]

  return (
    normalizationItems.some((item) => {
      if (item.status !== 'accepted') return false
      const years = item.applyAllYears
        ? yearsInVersionWindow
        : item.applyYears && item.applyYears.length > 0
          ? item.applyYears
          : [item.year]
      return years.some((year) => year >= lastFullYear - 2 && year <= lastFullYear)
    }) || yearsInVersionWindow.some((year) => hasLegacyNormalization(year))
  )
}

export function hasValuationFormChangesSinceVersion({
  formData,
  versionFormData,
}: {
  formData: ValuationFormData
  versionFormData?: ValuationRequest | null
}): boolean {
  if (!versionFormData) return false

  if (formData.company_name !== versionFormData.company_name) return true
  if (formData.revenue !== versionFormData.revenue) return true
  if (formData.ebitda !== getNumberRecordValue(versionFormData, 'ebitda')) return true
  if (formData.industry !== versionFormData.industry) return true
  if (formData.founding_year !== versionFormData.founding_year) return true
  if (formData.number_of_employees !== versionFormData.number_of_employees) return true
  if (formData.number_of_owners !== versionFormData.number_of_owners) return true

  return (
    JSON.stringify(getYearlyFinancials(formData)) !==
    JSON.stringify(getYearlyFinancials(versionFormData))
  )
}
