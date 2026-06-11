import type { ValuationFormData as VenusFormData } from '@/types/valuation'
import { normalizeBusinessTypeId } from '@/utils/businessTypeIdAliases'
import { parseEmployeeCount } from '@/utils/employeeCount'

export interface ManualChatFieldUpdateBridge {
  collectedDataKey?: string
  collectedDataValue: unknown
  formPatch: Partial<VenusFormData>
}

const FIELD_TO_COLLECTED_DATA_KEY: Record<string, string> = {
  business_type_id: 'businessType',
  nace_code: 'naceCode',
  nace_description: 'naceDescription',
  company_name: 'companyName',
  kbo_number: 'kboNumber',
  legal_form: 'legalForm',
  country_code: 'country',
  founding_year: 'yearFounded',
  address: 'address',
  ownerManagers: 'ownerManagers',
  number_of_employees: 'fteEmployees',
  fteEmployees: 'fteEmployees',
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseWholeNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isNaN(numeric) ? null : numeric
}

function buildAddressPatch(address: string): Partial<VenusFormData> {
  const match = address.match(/^(\d{4})\s+(.+)$/)
  if (match) {
    return { postal_code: match[1], city: match[2].trim() }
  }
  return { city: address }
}

export function buildManualChatFieldUpdateBridge(
  field: string,
  value: unknown
): ManualChatFieldUpdateBridge {
  const isAddressOnlyField = field === 'postal_code' || field === 'postalCode' || field === 'city'
  const collectedDataKey = isAddressOnlyField
    ? undefined
    : (FIELD_TO_COLLECTED_DATA_KEY[field] ?? field)
  const strVal = trimmedString(value)
  const hasStr = strVal.length > 0
  const yearVal = parseWholeNumber(value)
  const formPatch: Partial<VenusFormData> = {}

  if ((field === 'businessType' || field === 'business_type_id') && hasStr) {
    formPatch.business_type_id = normalizeBusinessTypeId(strVal)
  } else if ((field === 'nace_code' || field === 'naceCode') && hasStr) {
    formPatch.nace_code = strVal
  } else if ((field === 'nace_description' || field === 'naceDescription') && hasStr) {
    formPatch.nace_description = strVal
  } else if ((field === 'company_name' || field === 'companyName') && hasStr) {
    formPatch.company_name = strVal
  } else if ((field === 'kbo_number' || field === 'kboNumber') && hasStr) {
    formPatch.kbo_number = strVal
  } else if ((field === 'legal_form' || field === 'legalForm') && hasStr) {
    formPatch.legal_form = strVal
  } else if ((field === 'country_code' || field === 'country') && hasStr) {
    formPatch.country_code = strVal
  } else if ((field === 'founding_year' || field === 'yearFounded') && yearVal !== null) {
    formPatch.founding_year = yearVal
  } else if (field === 'industry' && hasStr) {
    formPatch.industry = strVal
  } else if ((field === 'postal_code' || field === 'postalCode') && hasStr) {
    formPatch.postal_code = strVal
  } else if (field === 'city' && hasStr) {
    formPatch.city = strVal
  } else if (field === 'address' && hasStr) {
    Object.assign(formPatch, buildAddressPatch(strVal))
  } else if (field === 'ownerManagers' || field === 'owner_managers') {
    const ownerCount = parseWholeNumber(value)
    if (ownerCount !== null && ownerCount >= 0) {
      formPatch.number_of_owners = ownerCount
    }
  } else if (field === 'fteEmployees' || field === 'number_of_employees') {
    const employeeCount = parseEmployeeCount(value)
    if (employeeCount !== undefined) {
      formPatch.number_of_employees = employeeCount
    }
  }

  return {
    collectedDataKey,
    collectedDataValue: value,
    formPatch,
  }
}

export function formatManualChatFieldUpdateValue(value: unknown, currentLocale: string): string {
  if (typeof value !== 'number') return String(value)
  const currencyLocale =
    currentLocale === 'fr' ? 'fr-BE' : currentLocale === 'en' ? 'en-BE' : 'nl-BE'
  return `€${Math.round(value).toLocaleString(currencyLocale)}`
}
