import type { CompanySearchResult } from '../../../services/registry/types'
import type { ValuationFormData } from '../../../types/valuation'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function getStringValue(value: unknown, key: string): string | undefined {
  const recordValue = asRecord(value)[key]
  return typeof recordValue === 'string' && recordValue.trim() ? recordValue : undefined
}

function getFirstStringValue(value: unknown, keys: string[]): string | undefined {
  for (const key of keys) {
    const recordValue = getStringValue(value, key)
    if (recordValue) return recordValue
  }
  return undefined
}

export function selectedCompanySyncKey(company: CompanySearchResult): string {
  return (
    company.company_id?.trim() ||
    company.registration_number?.trim() ||
    company.company_name?.trim() ||
    'selected-company'
  )
}

const REGISTRY_CONTEXT_KEYS = [
  'kbo_registration',
  'kbo_registration_number',
  'kboNumber',
  'kboRegistration',
  'kboRegistrationNumber',
  'kvk_registration',
  'kvk_registration_number',
  'kvkNumber',
  'kvkRegistration',
  'kvkRegistrationNumber',
  'registration_number',
  'registrationNumber',
  'company_registration_number',
  'companyRegistrationNumber',
  'company_number',
  'companyNumber',
  'enterprise_number',
  'enterpriseNumber',
  'company_id',
  'companyId',
  'company_address',
  'companyAddress',
  'registeredAddress',
  'company_status',
  'companyStatus',
  'legal_form',
  'legalForm',
]

export function removeRegistryContextFields(
  value: ValuationFormData['business_context']
): ValuationFormData['business_context'] | undefined {
  const context = asRecord(value)
  const next = { ...context }
  for (const key of REGISTRY_CONTEXT_KEYS) {
    delete next[key]
  }
  return Object.keys(next).length > 0 ? (next as ValuationFormData['business_context']) : undefined
}

const REGISTRATION_KEYS = [
  'kbo_registration',
  'kbo_registration_number',
  'kboNumber',
  'kboRegistration',
  'kboRegistrationNumber',
  'registration_number',
  'registrationNumber',
  'company_registration_number',
  'companyRegistrationNumber',
  'company_number',
  'companyNumber',
  'enterprise_number',
  'enterpriseNumber',
  'company_id',
  'companyId',
]

const ADDRESS_KEYS = [
  'company_address',
  'companyAddress',
  'registered_address',
  'registeredAddress',
]

export function buildInitialSelectedCompany(
  formData: ValuationFormData
): CompanySearchResult | null {
  if (!formData.company_name) return null

  const businessContext = formData.business_context
  let kboRegistration =
    getFirstStringValue(businessContext, REGISTRATION_KEYS) ?? formData.kbo_number
  let legalForm =
    getFirstStringValue(businessContext, ['legal_form', 'legalForm']) ?? formData.legal_form
  const companyId = getFirstStringValue(businessContext, ['company_id', 'companyId'])
  let companyAddress = getFirstStringValue(businessContext, ADDRESS_KEYS) ?? ''
  const companyStatus =
    getFirstStringValue(businessContext, ['company_status', 'companyStatus']) ?? 'Active'

  if (!kboRegistration) {
    kboRegistration = getStringValue(formData, 'kbo_registration')
  }
  if (!legalForm) {
    legalForm = formData.legal_form
  }
  if (!companyAddress) {
    const location = getStringValue(formData, 'location') || formData.city
    const postalCode = formData.postal_code
    if (location || postalCode) {
      companyAddress = [postalCode, location].filter(Boolean).join(' ') || ''
    }
  }

  if (!kboRegistration) return null

  const countryCode = formData.country_code || 'BE'
  return {
    company_id: companyId || kboRegistration,
    company_name: formData.company_name,
    result_type: 'COMPANY',
    registration_number: kboRegistration,
    country_code: countryCode,
    legal_form: legalForm || '',
    address: companyAddress,
    status: companyStatus,
    confidence_score: 1.0,
    registry_name: countryCode === 'NL' ? 'KVK' : 'KBO',
    registry_url: '',
  }
}

export function buildSelectedCompanyFormUpdates({
  selectedCompany,
  formData,
  effectiveCountryCode,
}: {
  selectedCompany: CompanySearchResult
  formData: ValuationFormData
  effectiveCountryCode: string
}): Partial<ValuationFormData> {
  const currentBusinessContext = asRecord(formData.business_context)
  const updatedBusinessContext: ValuationFormData['business_context'] = {
    ...currentBusinessContext,
    kbo_registration: selectedCompany.registration_number,
    kbo_registration_number: selectedCompany.registration_number,
    legal_form: selectedCompany.legal_form,
    company_id: selectedCompany.company_id,
    company_address: selectedCompany.address,
    company_status: selectedCompany.status,
  }

  const updates: Partial<ValuationFormData> = {
    business_context: updatedBusinessContext,
  }
  const selectedRegistration = selectedCompany.registration_number?.trim()
  const selectedCountryCode =
    selectedCompany.country_code || formData.country_code || effectiveCountryCode

  if (selectedCompany.company_name) {
    updates.company_name = selectedCompany.company_name
  }
  if (selectedCountryCode) {
    updates.country_code = selectedCountryCode
  }
  if (selectedRegistration) {
    updates.registration_number = selectedRegistration
    if (selectedCountryCode === 'NL') {
      updates.kvk_number = selectedRegistration
      updates.kbo_number = undefined
    } else {
      updates.kbo_number = selectedRegistration
      updates.kvk_number = undefined
    }
  }
  if (selectedCompany.legal_form) {
    updates.legal_form = selectedCompany.legal_form
  }

  return updates
}
