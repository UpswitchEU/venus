import {
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { KBOCompany } from '@/design-system'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ManualValuationFormData as ValuationFormData } from '../../../types/valuation'
import type { ManualInitialPrefillData } from '../utils/manualInputPrefill'
import { useManualFilingYearAutoConfirm } from './useManualFilingYearAutoConfirm'
import { useManualInitialPrefillBootstrap } from './useManualInitialPrefillBootstrap'
import { useManualOptionalSessionPrefillSync } from './useManualOptionalSessionPrefillSync'

type StoreFormPatch = Record<string, unknown>

export interface UseManualInputPrefillSyncParams {
  autoAdvancePastPrefilledSteps: boolean
  currentFilingYear: number
  formData: ValuationFormData
  initialData: Partial<ValuationFormData>
  setFormData: Dispatch<SetStateAction<ValuationFormData>>
  updateFormData: (patch: StoreFormPatch) => void
}

export interface UseManualInputPrefillSyncResult {
  companySearchValue: string
  countryUserOverrideRef: MutableRefObject<boolean>
  executePrefillCompanyReset: () => void
  financialsStepRef: RefObject<HTMLElement>
  prefillCompanyRef: MutableRefObject<{ name: string; kbo: string } | null>
  selectedCompany: KBOCompany | null
  setCompanySearchValue: Dispatch<SetStateAction<string>>
  setSelectedCompany: Dispatch<SetStateAction<KBOCompany | null>>
  setShowChangeCompanyWarning: Dispatch<SetStateAction<boolean>>
  showChangeCompanyWarning: boolean
}

/**
 * Keeps bootstrap/session prefill side effects out of the manual input shell.
 *
 * The important invariant: late prefill can fill blanks, but it must not race
 * back over explicit advisor input or restored session JSONB.
 */
export function useManualInputPrefillSync({
  autoAdvancePastPrefilledSteps,
  currentFilingYear,
  formData,
  initialData,
  setFormData,
  updateFormData,
}: UseManualInputPrefillSyncParams): UseManualInputPrefillSyncResult {
  const sessionReportId = useSessionStore((s) => s.session?.reportId)
  const [selectedCompany, setSelectedCompany] = useState<KBOCompany | null>(null)
  const [companySearchValue, setCompanySearchValue] = useState(formData.companyName || '')
  const countryUserOverrideRef = useRef(false)
  const prefillCompanyRef = useRef<{ name: string; kbo: string } | null>(null)
  const [showChangeCompanyWarning, setShowChangeCompanyWarning] = useState(false)
  const financialsStepRef = useRef<HTMLElement>(null)
  const initialAddress = initialData.address
  const initialBusinessStructure = initialData.businessStructure
  const initialBusinessType = initialData.businessType
  const initialBusinessTypeCode = initialData.businessTypeCode
  const initialCanonicalNaceCode = initialData.canonicalNaceCode
  const initialCompanyName = initialData.companyName
  const initialCountry = initialData.country
  const initialCurrentYearData = initialData.current_year_data
  const initialFilingYearConfirmed = initialData.filingYearConfirmed
  const initialFteEmployees = initialData.fteEmployees
  const initialHistoricalYearsData = initialData.historical_years_data
  const initialIndustry = initialData.industry
  const initialKboNumber = initialData.kboNumber
  const initialLegalForm = initialData.legalForm
  const initialNaceCode = initialData.naceCode
  const initialNaceDescription = initialData.naceDescription
  const initialOwnerManagers = initialData.ownerManagers
  const initialYearFounded = initialData.yearFounded
  const initialYearlyFinancials = initialData.yearlyFinancials
  const initialPrefill = useMemo<ManualInitialPrefillData>(
    () => ({
      address: initialAddress,
      businessStructure: initialBusinessStructure,
      businessType: initialBusinessType,
      businessTypeCode: initialBusinessTypeCode,
      canonicalNaceCode: initialCanonicalNaceCode,
      companyName: initialCompanyName,
      country: initialCountry,
      fteEmployees: initialFteEmployees,
      industry: initialIndustry,
      kboNumber: initialKboNumber,
      legalForm: initialLegalForm,
      naceCode: initialNaceCode,
      naceDescription: initialNaceDescription,
      ownerManagers: initialOwnerManagers,
      yearFounded: initialYearFounded,
      yearlyFinancials: initialYearlyFinancials,
    }),
    [
      initialAddress,
      initialBusinessStructure,
      initialBusinessType,
      initialBusinessTypeCode,
      initialCanonicalNaceCode,
      initialCompanyName,
      initialCountry,
      initialFteEmployees,
      initialIndustry,
      initialKboNumber,
      initialLegalForm,
      initialNaceCode,
      initialNaceDescription,
      initialOwnerManagers,
      initialYearFounded,
      initialYearlyFinancials,
    ]
  )

  useManualOptionalSessionPrefillSync(setFormData)

  useEffect(() => {
    if (!selectedCompany && showChangeCompanyWarning) {
      setShowChangeCompanyWarning(false)
    }
  }, [selectedCompany, showChangeCompanyWarning])

  useEffect(() => {
    const c = (formData.country || initialCountry || 'BE').toUpperCase()
    setSelectedCompany((prev) => {
      if (!prev) return prev
      const pc = prev.countryCode?.toUpperCase()
      if (pc && pc !== c) return null
      return prev
    })
  }, [formData.country, initialCountry])

  useManualFilingYearAutoConfirm({
    currentFilingYear,
    initialCurrentYearData,
    initialFilingYearConfirmed,
    initialHistoricalYearsData,
    initialYearlyFinancials,
    setFormData,
  })

  useManualInitialPrefillBootstrap({
    countryUserOverrideRef,
    initialPrefill,
    prefillCompanyRef,
    sessionReportId,
    setCompanySearchValue,
    setFormData,
    setSelectedCompany,
    updateFormData,
  })

  useEffect(() => {
    if (!autoAdvancePastPrefilledSteps) return
    const hasPrefilledCompany = !!formData.companyName && !!formData.businessType

    const timer = setTimeout(() => {
      if (hasPrefilledCompany && financialsStepRef.current) {
        financialsStepRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [autoAdvancePastPrefilledSteps, formData.companyName, formData.businessType])

  const executePrefillCompanyReset = useCallback(() => {
    prefillCompanyRef.current = null
    setSelectedCompany(null)
    setCompanySearchValue('')
    setShowChangeCompanyWarning(false)
  }, [])

  return {
    companySearchValue,
    countryUserOverrideRef,
    executePrefillCompanyReset,
    financialsStepRef,
    prefillCompanyRef,
    selectedCompany,
    setCompanySearchValue,
    setSelectedCompany,
    setShowChangeCompanyWarning,
    showChangeCompanyWarning,
  }
}
