import {
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { KBOCompany } from '@/design-system'
import { looksLikeNaceCode, naceBusinessTypeService } from '../../../services/naceBusinessTypeService'
import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ManualValuationFormData as ValuationFormData } from '../../../types/valuation'
import { isFilingYearConfirmedValue } from '../../../utils/fiscalYear'
import { mapLegalFormToBusinessStructure } from '../../../utils/legalFormMapping'
import { mergeOptionalSessionPrefillFields } from '../../../utils/mergeOptionalSessionPrefillFields'
import { shouldSuppressMercurySessionPrefill } from '../../../utils/prefillRestorationGate'
import {
  hasMeaningfulYearlyFinancials,
  shouldAutoConfirmPrefilledFilingYear,
} from '../utils/manualFinancialSeeds'

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
  const prefillAbortRef = useRef<boolean>(false)
  const countryUserOverrideRef = useRef(false)
  const prefillCompanyRef = useRef<{ name: string; kbo: string } | null>(null)
  const [showChangeCompanyWarning, setShowChangeCompanyWarning] = useState(false)
  const financialsStepRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let raf = 0
    const flush = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const fd = useManualFormStore.getState().formData as unknown as Record<string, unknown>
        setFormData((prevLocal) => {
          const patch = mergeOptionalSessionPrefillFields(fd, prevLocal)
          return Object.keys(patch).length > 0 ? { ...prevLocal, ...patch } : prevLocal
        })
      })
    }
    flush()
    const unsub = useManualFormStore.subscribe(flush)
    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
  }, [setFormData])

  useEffect(() => {
    if (!selectedCompany && showChangeCompanyWarning) {
      setShowChangeCompanyWarning(false)
    }
  }, [selectedCompany, showChangeCompanyWarning])

  useEffect(() => {
    const c = (formData.country || initialData.country || 'BE').toUpperCase()
    setSelectedCompany((prev) => {
      if (!prev) return prev
      const pc = prev.countryCode?.toUpperCase()
      if (pc && pc !== c) return null
      return prev
    })
  }, [formData.country, initialData.country])

  useEffect(() => {
    if (shouldAutoConfirmPrefilledFilingYear(initialData, currentFilingYear)) {
      setFormData((prev) =>
        isFilingYearConfirmedValue(prev.filingYearConfirmed)
          ? prev
          : { ...prev, filingYearConfirmed: true }
      )
    }
  }, [
    currentFilingYear,
    initialData.current_year_data?.year,
    initialData.filingYearConfirmed,
    initialData.yearlyFinancials,
    initialData,
    setFormData,
  ])

  useEffect(() => {
    const prefill = initialData
    if (!prefill || typeof prefill !== 'object') return

    if (shouldSuppressMercurySessionPrefill(sessionReportId)) {
      prefillAbortRef.current = false
      return () => {
        prefillAbortRef.current = true
      }
    }

    prefillAbortRef.current = false
    const isCurrent = () => !prefillAbortRef.current

    const applyPrefill = (
      prev: ValuationFormData,
      updates: Record<string, unknown>,
      key: keyof ValuationFormData,
      value: string | number | undefined
    ) => {
      if (key === 'country') {
        if (countryUserOverrideRef.current) return
        if (value === undefined || value === null) return
        const v = String(value).trim().toUpperCase()
        if (!v) return
        const cur = String(prev.country || '')
          .trim()
          .toUpperCase()
        if ((!cur || cur === 'BE') && v !== cur) {
          updates[key] = v
        }
        return
      }
      if (value === undefined || value === null) return
      if (typeof value === 'string' && value === '') return
      const current = prev[key]
      const isEmpty =
        current === undefined ||
        current === null ||
        (typeof current === 'string' && current === '') ||
        (typeof current === 'number' && key === 'ownerManagers' && current === 1) ||
        (key === 'fteEmployees' &&
          (current === undefined || (typeof current === 'number' && current === 5 && value !== 5)))
      if (isEmpty) updates[key] = value
    }

    const businessStructure = mapLegalFormToBusinessStructure(prefill.legalForm)

    const runPrefill = async () => {
      let businessTypeToApply = prefill.businessType
      let industryToApply = prefill.industry
      if (businessTypeToApply && looksLikeNaceCode(businessTypeToApply)) {
        const resolved = await naceBusinessTypeService.getBusinessTypeForNaceCode(
          businessTypeToApply.trim(),
          undefined,
          prefill.country
        )
        if (!isCurrent()) return
        if (resolved?.id) {
          businessTypeToApply = resolved.id
          industryToApply = resolved.category || prefill.industry
          updateFormData({ business_type_id: resolved.id, industry: industryToApply })
        } else {
          businessTypeToApply = ''
        }
      }
      if (businessTypeToApply && looksLikeNaceCode(businessTypeToApply)) {
        businessTypeToApply = ''
      }

      if (!isCurrent()) return
      let companyNameUpdate: string | undefined
      setFormData((prev) => {
        const updates: Record<string, unknown> = {}
        applyPrefill(prev, updates, 'companyName', prefill.companyName)
        applyPrefill(prev, updates, 'kboNumber', prefill.kboNumber)
        applyPrefill(prev, updates, 'legalForm', prefill.legalForm)
        applyPrefill(
          prev,
          updates,
          'businessStructure',
          prefill.businessStructure || businessStructure
        )
        applyPrefill(prev, updates, 'address', prefill.address)
        applyPrefill(prev, updates, 'naceCode', prefill.naceCode)
        applyPrefill(prev, updates, 'canonicalNaceCode', prefill.canonicalNaceCode)
        applyPrefill(prev, updates, 'naceDescription', prefill.naceDescription)
        applyPrefill(prev, updates, 'businessType', businessTypeToApply || undefined)
        applyPrefill(prev, updates, 'businessTypeCode', prefill.businessTypeCode)
        applyPrefill(prev, updates, 'industry', industryToApply)
        applyPrefill(prev, updates, 'country', prefill.country)
        applyPrefill(prev, updates, 'yearFounded', prefill.yearFounded)
        applyPrefill(prev, updates, 'ownerManagers', prefill.ownerManagers)
        applyPrefill(prev, updates, 'fteEmployees', prefill.fteEmployees)
        if (
          prefill.yearlyFinancials?.length &&
          hasMeaningfulYearlyFinancials(prefill.yearlyFinancials)
        ) {
          const currentIsDefault = prev.yearlyFinancials.every(
            (yf) => yf.revenue === 0 && yf.ebitda === 0
          )
          if (currentIsDefault) {
            updates.yearlyFinancials = prefill.yearlyFinancials
          }
        }
        if (updates.companyName) companyNameUpdate = String(updates.companyName)
        if (Object.keys(updates).length === 0) return prev
        return { ...prev, ...updates }
      })
      if (companyNameUpdate) setCompanySearchValue(companyNameUpdate)
      const hasExpandData =
        prefill.kboNumber || prefill.legalForm || businessTypeToApply || prefill.industry
      if (companyNameUpdate && hasExpandData) {
        setSelectedCompany({
          id: prefill.kboNumber || 'prefill',
          name: companyNameUpdate,
          kboNumber: prefill.kboNumber || '',
          legalForm: prefill.legalForm || '',
          address: prefill.address || '',
          postalCode: '',
          city: '',
          naceCode: prefill.canonicalNaceCode || prefill.naceCode,
          naceDescription: prefill.naceDescription,
          canonicalNaceCode: prefill.canonicalNaceCode || prefill.naceCode,
          activityCode:
            prefill.naceCode &&
            prefill.canonicalNaceCode &&
            prefill.naceCode !== prefill.canonicalNaceCode
              ? prefill.naceCode
              : undefined,
        })
        if (!prefillCompanyRef.current) {
          prefillCompanyRef.current = {
            name: companyNameUpdate,
            kbo: prefill.kboNumber || '',
          }
        }
      }
    }
    runPrefill()
    return () => {
      prefillAbortRef.current = true
    }
  }, [
    initialData?.companyName,
    initialData?.kboNumber,
    initialData?.legalForm,
    initialData?.businessStructure,
    initialData?.address,
    initialData?.naceCode,
    initialData?.canonicalNaceCode,
    initialData?.naceDescription,
    initialData?.businessType,
    initialData?.industry,
    initialData?.country,
    initialData?.yearFounded,
    initialData?.ownerManagers,
    initialData?.fteEmployees,
    initialData?.yearlyFinancials,
    initialData,
    updateFormData,
    sessionReportId,
    setFormData,
  ])

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

  useEffect(() => {
    const name = initialData?.companyName?.trim()
    if (name) {
      setCompanySearchValue((prev) => (prev?.trim() ? prev : name))
    }
  }, [initialData?.companyName])

  useEffect(() => {
    const name = initialData?.companyName?.trim()
    const hasExpandData =
      initialData?.kboNumber ||
      initialData?.legalForm ||
      initialData?.businessType ||
      initialData?.industry
    if (!name || !hasExpandData) return

    setSelectedCompany((prev) => {
      if (prev) return prev
      if (!prefillCompanyRef.current) {
        prefillCompanyRef.current = { name, kbo: initialData?.kboNumber || '' }
      }
      return {
        id: initialData?.kboNumber || 'prefill',
        name,
        kboNumber: initialData?.kboNumber || '',
        legalForm: initialData?.legalForm || '',
        address: initialData?.address || '',
        postalCode: '',
        city: '',
        naceCode: initialData?.naceCode,
        naceDescription: initialData?.naceDescription,
      }
    })
  }, [
    initialData?.companyName,
    initialData?.kboNumber,
    initialData?.legalForm,
    initialData?.businessType,
    initialData?.industry,
  ])

  const executePrefillCompanyReset = () => {
    prefillCompanyRef.current = null
    setSelectedCompany(null)
    setCompanySearchValue('')
    setShowChangeCompanyWarning(false)
  }

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
