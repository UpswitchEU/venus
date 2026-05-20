import { type Dispatch, type SetStateAction, useState } from 'react'
import { useManualFormStore } from '../../../store/manual'
import type { ValuationFormData } from '../../../types/valuation'
import { mapLegalFormToBusinessStructure } from '../../../utils/legalFormMapping'
import type { CollectedData } from '../components/manualLayoutDataTypes'
import { useManualCollectedDataSync } from './useManualCollectedDataSync'

export interface UseManualCollectedDataControllerParams {
  clientCompanyName?: string | null
  isAccountantFlow: boolean
  restorationComplete: boolean
  resultCompanyName?: string | null
  sessionData: unknown
  translateNewEstimation: string
  updateFormData: (patch: Partial<ValuationFormData>) => void
}

export interface UseManualCollectedDataControllerResult {
  collectedData: CollectedData
  displayCompanyName: string
  formActivityCode?: string | null
  formCountry?: string | null
  formNaceCode?: string | null
  setCollectedData: Dispatch<SetStateAction<CollectedData>>
}

export function useManualCollectedDataController({
  clientCompanyName,
  isAccountantFlow,
  restorationComplete,
  resultCompanyName,
  sessionData,
  translateNewEstimation,
  updateFormData,
}: UseManualCollectedDataControllerParams): UseManualCollectedDataControllerResult {
  const formCompanyName = useManualFormStore((s) => s.formData.company_name)
  const formBusinessTypeId = useManualFormStore((s) => s.formData.business_type_id)
  const formIndustry = useManualFormStore((s) => s.formData.industry)
  const formBusinessModel = useManualFormStore((s) => s.formData.business_model)
  const formCountry = useManualFormStore((s) => s.formData.country_code)
  const formYearFounded = useManualFormStore((s) => s.formData.founding_year)
  const formKboNumber = useManualFormStore((s) => s.formData.kbo_number)
  const formLegalForm = useManualFormStore((s) => s.formData.legal_form)
  const formCity = useManualFormStore((s) => s.formData.city)
  const formPostalCode = useManualFormStore((s) => s.formData.postal_code)
  const formNaceCode = useManualFormStore((s) => s.formData.nace_code)
  const formActivityCode = useManualFormStore((s) => s.formData.activity_code)
  const formNaceDescription = useManualFormStore((s) => s.formData.nace_description)
  const formNumberOfEmployees = useManualFormStore((s) => s.formData.number_of_employees)
  const formNumberOfOwners = useManualFormStore((s) => s.formData.number_of_owners)

  const companyName = formCompanyName || resultCompanyName
  const formAddress = [formPostalCode, formCity].filter(Boolean).join(' ')
  const [collectedData, setCollectedData] = useState<CollectedData>({
    companyName: companyName || '',
    kboNumber: formKboNumber || '',
    legalForm: formLegalForm || '',
    businessStructure: mapLegalFormToBusinessStructure(formLegalForm || '') || undefined,
    address: formAddress || '',
    naceCode: formActivityCode || formNaceCode || '',
    naceDescription: formNaceDescription || '',
    businessType: formBusinessTypeId || '',
    industry: formIndustry || '',
    businessModel: formBusinessModel || 'services',
    country: formCountry || 'BE',
    yearFounded: formYearFounded ? String(formYearFounded) : '',
    ownerManagers:
      typeof formNumberOfOwners === 'number' && formNumberOfOwners > 0 ? formNumberOfOwners : 1,
    fteEmployees: formNumberOfEmployees,
  })

  useManualCollectedDataSync<CollectedData>({
    formSurface: {
      activityCode: formActivityCode,
      address: formAddress,
      businessModel: formBusinessModel,
      businessTypeId: formBusinessTypeId,
      city: formCity,
      companyName,
      country: formCountry,
      industry: formIndustry,
      kboNumber: formKboNumber,
      legalForm: formLegalForm,
      naceCode: formNaceCode,
      naceDescription: formNaceDescription,
      postalCode: formPostalCode,
      yearFounded: formYearFounded,
    },
    restorationComplete,
    sessionData,
    setCollectedData,
    updateFormData,
  })

  const displayCompanyName =
    collectedData.companyName?.trim() ||
    (isAccountantFlow && clientCompanyName?.trim()) ||
    translateNewEstimation

  return {
    collectedData,
    displayCompanyName,
    formActivityCode,
    formCountry,
    formNaceCode,
    setCollectedData,
  }
}
