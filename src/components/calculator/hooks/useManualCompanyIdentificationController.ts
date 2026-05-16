import { Building2 } from 'lucide-react'
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from 'react'
import { type BusinessType, categoryIcons, type KBOCompany } from '@/design-system'
import { useBusinessTypes } from '../../../hooks/useBusinessTypes'
import { registryService } from '../../../services/registry/registryService'
import type { CompanySearchResult } from '../../../services/registry/types'
import type { ManualValuationFormData as ValuationFormData } from '../../../types/valuation'
import { mapLegalFormToBusinessStructure } from '../../../utils/legalFormMapping'
import { pickLegalFormFromRegistryHit } from '../../../utils/registryUtils'
import { useManualNaceBusinessTypePrefill } from './useManualNaceBusinessTypePrefill'

type StoreFormPatch = Record<string, unknown>
type Translate = (key: string) => string

export interface UseManualCompanyIdentificationControllerParams {
  executePrefillCompanyReset: () => void
  formData: ValuationFormData
  initialCountry?: string
  localizeActivityCodeCopy: (copy: string) => string
  prefillCompanyRef: MutableRefObject<{ name: string; kbo: string } | null>
  searchUnavailableMessage: string
  selectedCompany: KBOCompany | null
  setCompanySearchValue: Dispatch<SetStateAction<string>>
  setFormData: Dispatch<SetStateAction<ValuationFormData>>
  setSelectedCompany: Dispatch<SetStateAction<KBOCompany | null>>
  setShowChangeCompanyWarning: Dispatch<SetStateAction<boolean>>
  translate: Translate
  updateFormData: (patch: StoreFormPatch) => void
}

export interface UseManualCompanyIdentificationControllerResult {
  businessTypesError: string | null
  businessTypesForSearch: BusinessType[]
  businessTypesLoading: boolean
  executeClearCompany: () => void
  handleBusinessTypeSelect: (value: string, businessType?: BusinessType) => void
  handleClearCompany: () => void
  handleCompanySelect: (company: KBOCompany) => Promise<void>
  kboSearchFn: (query: string, signal?: AbortSignal) => Promise<KBOCompany[]>
  nacePrefillError: string | null
  refetchBusinessTypes: () => Promise<void>
  retryNacePrefill: () => void
  searchCountry: string
  selectedBusinessType: BusinessType | null
}

export function useManualCompanyIdentificationController({
  executePrefillCompanyReset,
  formData,
  initialCountry,
  localizeActivityCodeCopy,
  prefillCompanyRef,
  searchUnavailableMessage,
  selectedCompany,
  setCompanySearchValue,
  setFormData,
  setSelectedCompany,
  setShowChangeCompanyWarning,
  translate,
  updateFormData,
}: UseManualCompanyIdentificationControllerParams): UseManualCompanyIdentificationControllerResult {
  const [selectedBusinessType, setSelectedBusinessType] = useState<BusinessType | null>(null)
  const searchCountry = formData.country || initialCountry || 'BE'

  const kboSearchFn = useCallback(
    async (query: string, signal?: AbortSignal): Promise<KBOCompany[]> => {
      if (!query || query.trim().length < 2) return []
      const response = await registryService.searchCompanies(
        query.trim(),
        searchCountry,
        15,
        signal
      )
      if (!response.success) {
        throw new Error(response.error || searchUnavailableMessage)
      }
      if (!response.results) return []
      return response.results.map((result: CompanySearchResult, index: number) =>
        mapRegistryResultToKboCompany(result, index, searchCountry)
      )
    },
    [searchCountry, searchUnavailableMessage]
  )

  const {
    businessTypes,
    loading: businessTypesLoading,
    error: businessTypesError,
    refetch: refetchBusinessTypes,
  } = useBusinessTypes()
  const businessTypesForSearch = useMemo(
    () => businessTypes.map(mapBusinessTypeForSearch),
    [businessTypes]
  )

  const {
    clearNacePrefillError,
    nacePrefillError,
    prefillBusinessTypeForCompany,
    retryNacePrefill,
  } = useManualNaceBusinessTypePrefill({
    businessTypesForSearch,
    formData,
    localizeActivityCodeCopy,
    selectedBusinessTypeId: selectedBusinessType?.id,
    selectedCompany,
    setFormData,
    setSelectedBusinessType,
    translate,
    updateFormData,
  })

  const handleCompanySelect = useCallback(
    async (company: KBOCompany) => {
      setSelectedCompany(company)
      setCompanySearchValue(company.name ?? '')

      const addr = company.address ?? ''
      const postal = company.postalCode ?? ''
      const city = company.city ?? ''
      const addressStr =
        postal && addr && !addr.includes(postal) ? `${addr}, ${postal} ${city}` : addr

      const canonical = company.canonicalNaceCode?.trim() || company.naceCode?.trim() || ''
      const displayCode = company.activityCode?.trim() || company.naceCode?.trim() || ''
      const baseUpdates: Partial<ValuationFormData> = {
        companyName: company.name ?? '',
        kboNumber: company.kboNumber ?? '',
        legalForm: company.legalForm ?? '',
        address: addressStr,
        naceCode: displayCode,
        canonicalNaceCode: canonical,
        naceDescription: company.naceDescription ?? '',
        businessStructure: mapLegalFormToBusinessStructure(company.legalForm ?? ''),
      }

      setFormData((prev) => ({ ...prev, ...baseUpdates }))
      clearNacePrefillError()

      updateFormData({
        kbo_number: company.kboNumber ?? '',
        legal_form: company.legalForm ?? '',
        nace_code: canonical,
        nace_description: baseUpdates.naceDescription || '',
        ...(displayCode && canonical && displayCode !== canonical
          ? { activity_code: displayCode }
          : { activity_code: undefined }),
      })

      await prefillBusinessTypeForCompany(
        company,
        baseUpdates,
        canonical || company.naceCode?.trim()
      )
    },
    [
      clearNacePrefillError,
      prefillBusinessTypeForCompany,
      setCompanySearchValue,
      setFormData,
      setSelectedCompany,
      updateFormData,
    ]
  )

  const handleBusinessTypeSelect = useCallback(
    (value: string, businessType?: BusinessType) => {
      setSelectedBusinessType(businessType || null)
      clearNacePrefillError()
      setFormData((prev) => ({
        ...prev,
        businessType: value,
        businessTypeCode: businessType ? businessType.code : '',
        industry: businessType ? businessType.category : '',
      }))
      if (businessType) {
        updateFormData({ business_type_id: value, industry: businessType.category })
      } else {
        updateFormData({ business_type_id: undefined, industry: undefined })
      }
    },
    [clearNacePrefillError, setFormData, updateFormData]
  )

  const executeClearCompany = useCallback(() => {
    executePrefillCompanyReset()
    clearNacePrefillError()
    setSelectedBusinessType(null)
    setFormData((prev) => ({
      ...prev,
      companyName: '',
      kboNumber: '',
      legalForm: '',
      address: '',
      naceCode: '',
      canonicalNaceCode: '',
      naceDescription: '',
      businessStructure: '',
      businessType: '',
      businessTypeCode: '',
      industry: '',
    }))
    updateFormData({
      business_type_id: undefined,
      industry: undefined,
      kbo_number: '',
      legal_form: '',
      nace_code: '',
      nace_description: '',
      activity_code: undefined,
    })
  }, [clearNacePrefillError, executePrefillCompanyReset, setFormData, updateFormData])

  const handleClearCompany = () => {
    if (prefillCompanyRef.current && selectedCompany) {
      setShowChangeCompanyWarning(true)
      return
    }
    executeClearCompany()
  }

  return {
    businessTypesError,
    businessTypesForSearch,
    businessTypesLoading,
    executeClearCompany,
    handleBusinessTypeSelect,
    handleClearCompany,
    handleCompanySelect,
    kboSearchFn,
    nacePrefillError,
    refetchBusinessTypes,
    retryNacePrefill,
    searchCountry,
    selectedBusinessType,
  }
}

function mapRegistryResultToKboCompany(
  result: CompanySearchResult,
  index: number,
  searchCountry: string
): KBOCompany {
  const raw = result as unknown as Record<string, unknown>
  const legalFormResolved =
    pickLegalFormFromRegistryHit(raw) ||
    (typeof result.legal_form === 'string' ? result.legal_form : '')
  const canonical = (result.canonical_nace_code || result.nace_code)?.trim() || ''
  const activity = (result.activity_code || '').trim()
  const displayActivity = activity && canonical && activity !== canonical ? activity : undefined
  const btIdRaw = raw['business_type_id']
  const btTitleRaw = raw['business_type_title']
  const businessTypeId = typeof btIdRaw === 'string' && btIdRaw.trim() ? btIdRaw.trim() : undefined
  const businessTypeTitle =
    typeof btTitleRaw === 'string' && btTitleRaw.trim() ? btTitleRaw.trim() : undefined

  return {
    id:
      result.company_id ||
      (result.kbo_number || result.registration_number || `kbo-${index}`).replace(/[.\s]/g, ''),
    name: result.company_name,
    kboNumber: result.kbo_number || result.registration_number,
    legalForm: legalFormResolved,
    address: [result.address, result.postal_code, result.city].filter(Boolean).join(', '),
    postalCode: result.postal_code || '',
    city: result.city || '',
    naceCode: canonical,
    naceDescription: (result.activity_label || result.nace_description || '').trim() || '',
    canonicalNaceCode: canonical || undefined,
    activityCode: displayActivity,
    activityLabel: (result.activity_label || result.nace_description || '').trim() || undefined,
    activityTaxonomy: result.taxonomy,
    countryCode: result.country_code || searchCountry,
    businessTypeId,
    businessTypeTitle,
  }
}

function mapBusinessTypeForSearch(bt: {
  category?: unknown
  icon?: string | null
  id: string
  industryMapping?: string | null
  popular?: boolean
  title: string
}): BusinessType {
  const apiCategoryToIconKey: Record<string, string> = {
    restaurant: 'food',
    restaurants: 'food',
    horeca: 'hospitality',
    catering: 'food',
    professional: 'consulting',
    professionals: 'consulting',
  }
  const cat =
    typeof bt.category === 'string'
      ? bt.category
      : ((bt.category as Record<string, unknown>)?.name ??
        (bt.category as Record<string, unknown>)?.title ??
        'other')
  const rawCategory = String(cat).toLowerCase().replace(/\s+/g, '-')
  const iconKey = apiCategoryToIconKey[rawCategory] ?? rawCategory
  const category = categoryIcons[iconKey] ? iconKey : 'other'
  return {
    id: bt.id,
    code: bt.industryMapping || bt.id,
    name: bt.title,
    category,
    icon: categoryIcons[iconKey] ?? categoryIcons['other'] ?? Building2,
    emoji: bt.icon || '\u{1F3E2}',
    popular: bt.popular ?? false,
  }
}
