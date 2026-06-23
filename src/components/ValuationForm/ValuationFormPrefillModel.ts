import type { BootstrapContextValue } from '../../lib/bootstrap/BootstrapContext'
import type { BusinessType } from '../../services/businessTypesApi'
import type { ValuationFormData } from '../../types/valuation'
import { buildBusinessTypeFormData } from './utils/businessTypeFormData'
import { matchBusinessType } from './utils/businessTypeMatching'
import { getStringRecordValue } from './utils/recordAccess'

export interface BusinessCardPrefillPayload {
  company_name: string
  industry: string
  business_model: string
  founding_year: number
  country_code: string
  business_type_id?: string
  employee_count?: number
  kbo_number?: string
  vat_number?: string
  city?: string
  postal_code?: string
  legal_form?: string
  nace_code?: string
  nace_description?: string
}

export function isViewingExistingBootstrapReport(bootstrap: BootstrapContextValue | null): boolean {
  return bootstrap?.report?.mode === 'existing' && bootstrap.report.hasExistingData
}

export function hasMeaningfulBootstrapPrefill({
  bootstrap,
  prefillConfidence,
}: {
  bootstrap: BootstrapContextValue | null
  prefillConfidence: number
}): boolean {
  if (!bootstrap) return false

  const financials = bootstrap.prefillData.financials
  const hasFiniteFinancial =
    financials &&
    ((financials.revenue != null && Number.isFinite(Number(financials.revenue))) ||
      (financials.ebitda != null && Number.isFinite(Number(financials.ebitda))) ||
      (financials.yearData && Object.keys(financials.yearData).length > 0))

  return !!(
    bootstrap.hasPrefilledData ||
    (bootstrap.prefillData.fieldsPopulated?.length ?? 0) > 0 ||
    prefillConfidence >= 0.05 ||
    bootstrap.prefillData.companyInfo?.companyName?.trim() ||
    bootstrap.prefillData.businessType?.id ||
    hasFiniteFinancial
  )
}

export function resolveBusinessCardBusinessTypeFormData({
  businessCard,
  businessTypes,
}: {
  businessCard: BusinessCardPrefillPayload
  businessTypes: readonly BusinessType[]
}): Partial<ValuationFormData> | null {
  const businessCardBusinessTypeId = getStringRecordValue(businessCard, 'business_type_id')
  if (businessCardBusinessTypeId) {
    const matchingType = businessTypes.find((bt) => bt.id === businessCardBusinessTypeId)
    return matchingType
      ? buildBusinessTypeFormData(matchingType, businessCard.industry || 'services')
      : null
  }

  if (!businessCard.industry) return null

  const matchingType = businessTypes.find(
    (bt) => bt.industry === businessCard.industry || bt.industryMapping === businessCard.industry
  )
  return matchingType ? buildBusinessTypeFormData(matchingType) : null
}

export function resolvePrefilledQueryBusinessTypeFormData({
  prefilledQuery,
  businessTypes,
}: {
  prefilledQuery: string | null
  businessTypes: readonly BusinessType[]
}): { matchedType: BusinessType; formData: Partial<ValuationFormData> } | null {
  if (!prefilledQuery) return null

  const matchedBusinessTypeId = matchBusinessType(prefilledQuery, businessTypes)
  if (!matchedBusinessTypeId) return null

  const matchedType = businessTypes.find((bt) => bt.id === matchedBusinessTypeId)
  return matchedType
    ? {
        matchedType,
        formData: buildBusinessTypeFormData(matchedType),
      }
    : null
}
