import type { KBOCompany } from '@/design-system'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { normalizeBusinessTypeId } from '../../../utils/businessTypeIdAliases'
import { mapLegalFormToBusinessStructure } from '../../../utils/legalFormMapping'
import { hasMeaningfulYearlyFinancials } from './manualFinancialSeeds'

export interface ManualInitialPrefillData {
  address?: string
  businessStructure?: string
  businessType?: string
  businessTypeCode?: string
  canonicalNaceCode?: string
  city?: string
  companyName?: string
  country?: string
  fteEmployees?: number
  industry?: string
  kboNumber?: string
  legalForm?: string
  naceCode?: string
  naceDescription?: string
  ownerManagers?: number
  postalCode?: string
  yearFounded?: string
  yearlyFinancials?: YearlyFinancials[]
}

export function buildManualInitialPrefillData(
  initialData: Partial<ManualValuationFormData>
): ManualInitialPrefillData {
  return {
    address: initialData.address,
    businessStructure: initialData.businessStructure,
    businessType: normalizeBusinessTypeId(initialData.businessType),
    businessTypeCode:
      normalizeBusinessTypeId(initialData.businessTypeCode) ?? initialData.businessTypeCode,
    canonicalNaceCode: initialData.canonicalNaceCode,
    city: initialData.city,
    companyName: initialData.companyName,
    country: initialData.country,
    fteEmployees: initialData.fteEmployees,
    industry: initialData.industry,
    kboNumber: initialData.kboNumber,
    legalForm: initialData.legalForm,
    naceCode: initialData.naceCode,
    naceDescription: initialData.naceDescription,
    ownerManagers: initialData.ownerManagers,
    postalCode: initialData.postal_code,
    yearFounded: initialData.yearFounded,
    yearlyFinancials: initialData.yearlyFinancials,
  }
}

interface ApplyManualInitialPrefillParams {
  businessTypeToApply?: string
  countryUserOverridden: boolean
  industryToApply?: string
  prefill: ManualInitialPrefillData
  previous: ManualValuationFormData
}

export interface AppliedManualInitialPrefill {
  companyNameUpdate?: string
  next: ManualValuationFormData
  updates: Partial<ManualValuationFormData>
}

type PrefillValue = string | number | undefined

function canApplyScalarPrefill(
  previous: ManualValuationFormData,
  key: keyof ManualValuationFormData,
  value: PrefillValue
) {
  if (value === undefined || value === null) return false
  if (typeof value === 'string' && value === '') return false

  const current = previous[key]
  return (
    current === undefined ||
    current === null ||
    (typeof current === 'string' && current === '') ||
    (typeof current === 'number' && key === 'ownerManagers' && current === 1) ||
    (key === 'fteEmployees' &&
      (current === undefined || (typeof current === 'number' && current === 5 && value !== 5)))
  )
}

function maybeApplyCountryPrefill({
  countryUserOverridden,
  previous,
  updates,
  value,
}: {
  countryUserOverridden: boolean
  previous: ManualValuationFormData
  updates: Partial<ManualValuationFormData>
  value?: string
}) {
  if (countryUserOverridden || value === undefined || value === null) return
  const nextCountry = String(value).trim().toUpperCase()
  if (!nextCountry) return
  const currentCountry = String(previous.country || '')
    .trim()
    .toUpperCase()
  if ((!currentCountry || currentCountry === 'BE') && nextCountry !== currentCountry) {
    updates.country = nextCountry
  }
}

function maybeApplyScalarPrefill<K extends keyof ManualValuationFormData>(
  previous: ManualValuationFormData,
  updates: Partial<ManualValuationFormData>,
  key: K,
  value: PrefillValue
) {
  if (canApplyScalarPrefill(previous, key, value)) {
    updates[key] = value as ManualValuationFormData[K]
  }
}

export function applyManualInitialPrefill({
  businessTypeToApply,
  countryUserOverridden,
  industryToApply,
  prefill,
  previous,
}: ApplyManualInitialPrefillParams): AppliedManualInitialPrefill {
  const updates: Partial<ManualValuationFormData> = {}
  const mappedBusinessStructure = mapLegalFormToBusinessStructure(prefill.legalForm)

  maybeApplyScalarPrefill(previous, updates, 'companyName', prefill.companyName)
  maybeApplyScalarPrefill(previous, updates, 'kboNumber', prefill.kboNumber)
  maybeApplyScalarPrefill(previous, updates, 'legalForm', prefill.legalForm)
  maybeApplyScalarPrefill(
    previous,
    updates,
    'businessStructure',
    prefill.businessStructure || mappedBusinessStructure
  )
  maybeApplyScalarPrefill(previous, updates, 'address', prefill.address)
  maybeApplyScalarPrefill(previous, updates, 'naceCode', prefill.naceCode)
  maybeApplyScalarPrefill(previous, updates, 'canonicalNaceCode', prefill.canonicalNaceCode)
  maybeApplyScalarPrefill(previous, updates, 'naceDescription', prefill.naceDescription)
  maybeApplyScalarPrefill(previous, updates, 'businessType', businessTypeToApply || undefined)
  maybeApplyScalarPrefill(previous, updates, 'businessTypeCode', prefill.businessTypeCode)
  maybeApplyScalarPrefill(previous, updates, 'industry', industryToApply)
  maybeApplyCountryPrefill({
    countryUserOverridden,
    previous,
    updates,
    value: prefill.country,
  })
  maybeApplyScalarPrefill(previous, updates, 'yearFounded', prefill.yearFounded)
  maybeApplyScalarPrefill(previous, updates, 'ownerManagers', prefill.ownerManagers)
  maybeApplyScalarPrefill(previous, updates, 'fteEmployees', prefill.fteEmployees)

  if (prefill.yearlyFinancials?.length && hasMeaningfulYearlyFinancials(prefill.yearlyFinancials)) {
    const currentIsDefault = previous.yearlyFinancials.every(
      (year) => year.revenue === 0 && year.ebitda === 0
    )
    if (currentIsDefault) {
      updates.yearlyFinancials = prefill.yearlyFinancials
    }
  }

  const companyNameUpdate =
    typeof updates.companyName === 'string' ? updates.companyName : undefined

  return {
    companyNameUpdate,
    next: Object.keys(updates).length > 0 ? { ...previous, ...updates } : previous,
    updates,
  }
}

export function buildManualPrefillCompany({
  businessTypeToApply,
  companyName,
  prefill,
}: {
  businessTypeToApply?: string
  companyName?: string
  prefill: ManualInitialPrefillData
}): KBOCompany | null {
  const name = companyName?.trim()
  const hasExpandData =
    prefill.kboNumber || prefill.legalForm || businessTypeToApply || prefill.industry
  if (!name || !hasExpandData) return null

  return {
    id: prefill.kboNumber || 'prefill',
    name,
    kboNumber: prefill.kboNumber || '',
    legalForm: prefill.legalForm || '',
    address: prefill.address || '',
    postalCode: prefill.postalCode || '',
    city: prefill.city || '',
    naceCode: prefill.canonicalNaceCode || prefill.naceCode,
    naceDescription: prefill.naceDescription,
    canonicalNaceCode: prefill.canonicalNaceCode || prefill.naceCode,
    activityCode:
      prefill.naceCode &&
      prefill.canonicalNaceCode &&
      prefill.naceCode !== prefill.canonicalNaceCode
        ? prefill.naceCode
        : undefined,
    countryCode: prefill.country,
  }
}
