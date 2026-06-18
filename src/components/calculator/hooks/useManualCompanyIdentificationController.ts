import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from 'react'
import { type KBOCompany, type BusinessType as SearchBusinessType } from '@/design-system'
import { useBusinessTypes } from '../../../hooks/useBusinessTypes'
import type { BusinessType as ApiBusinessType } from '../../../services/businessTypesApi'
import { registryService } from '../../../services/registry/registryService'
import type { CompanySearchResult } from '../../../services/registry/types'
import type { ManualValuationFormData as ValuationFormData } from '../../../types/valuation'
import { normalizeBusinessTypeId } from '../../../utils/businessTypeIdAliases'
import { mapApiBusinessTypeForEntitySearch } from '../../../utils/businessTypeSearchMapping'
import { mapLegalFormToBusinessStructure } from '../../../utils/legalFormMapping'
import { mapRegistrySearchResultToKboCompany } from '../../../utils/mapRegistrySearchResultToKboCompany'
import {
  buildApiBusinessTypeFromSearchType,
  buildBusinessTypeFormData,
  buildBusinessTypeSegmentsFormData,
  resolveBusinessTypesFromKboCompany,
  selectedBusinessTypeIdsFromFormData,
} from '../../ValuationForm/utils/businessTypeFormData'
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
  businessTypesForSearch: SearchBusinessType[]
  businessTypesLoading: boolean
  executeClearCompany: () => void
  handleBusinessTypeSelect: (value: string, businessType?: SearchBusinessType) => void
  handleBusinessTypeSelectionChange: (
    businessTypeIds: string[],
    selectedBusinessTypes: ApiBusinessType[]
  ) => void
  handleClearCompany: () => void
  handleCompanySelect: (company: KBOCompany) => Promise<void>
  kboSearchFn: (query: string, signal?: AbortSignal) => Promise<KBOCompany[]>
  nacePrefillError: string | null
  refetchBusinessTypes: () => Promise<void>
  retryNacePrefill: () => void
  searchCountry: string
  selectedBusinessType: SearchBusinessType | null
  selectedBusinessTypeIds: string[]
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
  const [selectedBusinessType, setSelectedBusinessType] = useState<SearchBusinessType | null>(null)
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
        mapRegistrySearchResultToKboCompany(result, { index, searchCountry })
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
    () => businessTypes.map(mapApiBusinessTypeForEntitySearch),
    [businessTypes]
  )
  const selectedBusinessTypeIds = useMemo(
    () => selectedBusinessTypeIdsFromFormData(formData),
    [formData]
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

  const applyApiBusinessTypeSelection = useCallback(
    (selectedBusinessTypes: ApiBusinessType[], baseUpdates: Partial<ValuationFormData> = {}) => {
      const primaryBusinessType = selectedBusinessTypes[0]
      clearNacePrefillError()

      if (!primaryBusinessType) {
        setSelectedBusinessType(null)
        setFormData((prev) => ({
          ...prev,
          businessType: '',
          businessTypeCode: '',
          industry: '',
          business_type_id: undefined,
          business_type_title: undefined,
          business_type_segments: [],
          business_model: undefined,
        }))
        updateFormData({
          business_type_id: undefined,
          business_type_title: undefined,
          business_type_segments: [],
          business_model: undefined,
          industry: undefined,
        })
        return
      }

      const primaryPatch = buildBusinessTypeFormData(primaryBusinessType)
      const segmentPatch = buildBusinessTypeSegmentsFormData(
        selectedBusinessTypes,
        formData.business_type_segments
      )
      const mappedPrimary = mapApiBusinessTypeForEntitySearch(primaryBusinessType)
      const primaryId =
        normalizeBusinessTypeId(primaryPatch.business_type_id) ??
        normalizeBusinessTypeId(primaryBusinessType.id) ??
        primaryBusinessType.id
      const nextLocalPatch: Partial<ValuationFormData> = {
        ...baseUpdates,
        ...primaryPatch,
        ...segmentPatch,
        businessType: primaryId,
        businessTypeCode: mappedPrimary.code || primaryId,
        industry:
          typeof primaryPatch.industry === 'string' && primaryPatch.industry.trim()
            ? primaryPatch.industry
            : mappedPrimary.category,
      }

      setSelectedBusinessType(mappedPrimary)
      setFormData((prev) => ({ ...prev, ...nextLocalPatch }))
      updateFormData({
        ...primaryPatch,
        ...segmentPatch,
      })
    },
    [clearNacePrefillError, formData.business_type_segments, setFormData, updateFormData]
  )

  const handleCompanySelect = useCallback(
    async (company: KBOCompany) => {
      setSelectedCompany(company)
      setCompanySearchValue(company.name ?? '')

      // NACE codes carry two granularities (mirrors mapRegistrySearchResultToKboCompany):
      //  - `canonical`   → the broad canonical NACE used as the primary nace_code
      //  - `displayCode` → the most specific code (registry activity sub-code when
      //    present), surfaced to the user and stored as activity_code only when it
      //    actually differs from the canonical (otherwise it's redundant).
      const canonical = company.canonicalNaceCode?.trim() || company.naceCode?.trim() || ''
      const displayCode = company.activityCode?.trim() || canonical

      const baseUpdates: Partial<ValuationFormData> = {
        companyName: company.name ?? '',
        kboNumber: company.kboNumber ?? '',
        legalForm: company.legalForm ?? '',
        address: company.address ?? '',
        city: company.city ?? '',
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
        ...(company.postalCode ? { postal_code: company.postalCode } : {}),
        ...(company.city ? { city: company.city } : {}),
        ...(displayCode && canonical && displayCode !== canonical
          ? { activity_code: displayCode }
          : { activity_code: undefined }),
      })

      const seededBusinessTypes = resolveBusinessTypesFromKboCompany(company, businessTypes)
      if (seededBusinessTypes.length > 0) {
        applyApiBusinessTypeSelection(seededBusinessTypes, baseUpdates)
        return
      }

      await prefillBusinessTypeForCompany(
        company,
        baseUpdates,
        canonical || company.naceCode?.trim()
      )
    },
    [
      applyApiBusinessTypeSelection,
      businessTypes,
      clearNacePrefillError,
      prefillBusinessTypeForCompany,
      setCompanySearchValue,
      setFormData,
      setSelectedCompany,
      updateFormData,
    ]
  )

  const handleBusinessTypeSelect = useCallback(
    (value: string, businessType?: SearchBusinessType) => {
      const normalizedValue = normalizeBusinessTypeId(value)
      if (!normalizedValue || !businessType) {
        applyApiBusinessTypeSelection([])
        return
      }
      applyApiBusinessTypeSelection([
        buildApiBusinessTypeFromSearchType(normalizedValue, {
          ...businessType,
          id: normalizedValue,
          code: normalizeBusinessTypeId(businessType.code) ?? businessType.code,
        }),
      ])
    },
    [applyApiBusinessTypeSelection]
  )

  const handleBusinessTypeSelectionChange = useCallback(
    (_businessTypeIds: string[], selectedBusinessTypes: ApiBusinessType[]) => {
      applyApiBusinessTypeSelection(selectedBusinessTypes)
    },
    [applyApiBusinessTypeSelection]
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
      business_type_id: undefined,
      business_type_title: undefined,
      business_type_segments: [],
      business_model: undefined,
    }))
    updateFormData({
      business_type_id: undefined,
      business_type_title: undefined,
      business_type_segments: [],
      business_model: undefined,
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
    handleBusinessTypeSelectionChange,
    handleClearCompany,
    handleCompanySelect,
    kboSearchFn,
    nacePrefillError,
    refetchBusinessTypes,
    retryNacePrefill,
    searchCountry,
    selectedBusinessType,
    selectedBusinessTypeIds,
  }
}
