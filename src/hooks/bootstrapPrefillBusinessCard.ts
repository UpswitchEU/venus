import type { BusinessTypeInfo, CompanyInfo, PartialFinancials } from '../lib/bootstrap/types'
import { getCurrentFilingYear } from '../utils/fiscalYear'
import { type ManualBusinessCard, resolveCountryCode } from './bootstrapPrefillGuards'

export function buildBusinessCard(
  companyInfo: CompanyInfo,
  financials?: PartialFinancials,
  businessType?: BusinessTypeInfo,
  fallbackCountryCode?: string
): ManualBusinessCard {
  const resolvedCountryCode = resolveCountryCode(companyInfo.countryCode, fallbackCountryCode)

  return {
    company_name: companyInfo.companyName ?? '',
    industry: businessType?.industry || 'services',
    business_model: businessType?.id || 'other',
    founding_year: companyInfo.foundingYear || getCurrentFilingYear() - 5,
    country_code: resolvedCountryCode || '',
    employee_count: financials?.employeeCount,
    kbo_number: companyInfo.kboNumber,
    vat_number: companyInfo.vatNumber,
    city: companyInfo.city,
    postal_code: companyInfo.postalCode,
    legal_form: companyInfo.legalForm,
    nace_code: companyInfo.naceCode,
    nace_description: companyInfo.naceDescription,
    activity_code: companyInfo.activityCode,
    activity_label: companyInfo.activityLabel,
  }
}
