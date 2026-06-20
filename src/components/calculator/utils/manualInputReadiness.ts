import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { hasExplicitNumericValue } from '../../../utils/yearlyFinancials'

export interface ManualInputReadiness {
  hasCompanyInfo: boolean
  hasBusinessTypeSegment: boolean
  hasBusinessType: boolean
  hasFinancials: boolean
  hasEbitdaValue: boolean
  totalYearsWithEbitda: number
  canSubmit: boolean
}

export function deriveManualInputReadiness({
  canSave,
  formData,
  hasSelectedBusinessType,
  hasSelectedCompany,
  latestCompleteYearlyFinancial,
  resolvedBusinessTypeId,
}: {
  canSave: boolean
  formData: ManualValuationFormData
  hasSelectedBusinessType: boolean
  hasSelectedCompany: boolean
  latestCompleteYearlyFinancial?: YearlyFinancials | null
  resolvedBusinessTypeId?: string | null
}): ManualInputReadiness {
  const yearlyFinancials = formData.yearlyFinancials ?? []
  const hasCompanyInfo = hasSelectedCompany || Boolean(formData.companyName?.length)
  const hasBusinessTypeSegment = (formData.business_type_segments ?? []).some((segment) =>
    Boolean(segment.business_type_id?.trim())
  )
  const hasBusinessType =
    hasSelectedBusinessType ||
    Boolean(formData.businessType?.length) ||
    Boolean(resolvedBusinessTypeId) ||
    hasBusinessTypeSegment
  const hasFinancials = Boolean(latestCompleteYearlyFinancial)
  const totalYearsWithEbitda = yearlyFinancials.filter((year) =>
    hasExplicitNumericValue(year.ebitda)
  ).length

  return {
    hasCompanyInfo,
    hasBusinessTypeSegment,
    hasBusinessType,
    hasFinancials,
    hasEbitdaValue: totalYearsWithEbitda > 0,
    totalYearsWithEbitda,
    canSubmit: hasCompanyInfo && hasBusinessType && hasFinancials && canSave,
  }
}
