import { Building2 } from 'lucide-react'
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import type { BusinessType, KBOCompany } from '@/design-system'
import { naceBusinessTypeService } from '../../../services/naceBusinessTypeService'
import type { ManualValuationFormData as ValuationFormData } from '../../../types/valuation'
import { normalizeBusinessTypeId } from '../../../utils/businessTypeIdAliases'

type StoreFormPatch = Record<string, unknown>

type Translate = (key: string) => string

export interface UseManualNaceBusinessTypePrefillParams {
  businessTypesForSearch: BusinessType[]
  formData: ValuationFormData
  localizeActivityCodeCopy: (copy: string) => string
  selectedBusinessTypeId?: string
  selectedCompany: KBOCompany | null
  setFormData: Dispatch<SetStateAction<ValuationFormData>>
  setSelectedBusinessType: Dispatch<SetStateAction<BusinessType | null>>
  translate: Translate
  updateFormData: (patch: StoreFormPatch) => void
}

export interface UseManualNaceBusinessTypePrefillResult {
  clearNacePrefillError: () => void
  nacePrefillError: string | null
  prefillBusinessTypeForCompany: (
    company: KBOCompany,
    baseUpdates: Partial<ValuationFormData>,
    naceCode?: string
  ) => Promise<void>
  retryNacePrefill: () => void
}

/**
 * Owns NACE/SBI -> business-type prefill for the manual input panel.
 *
 * Both background prefill and explicit company selection mutate the same
 * business-type state, so they share abort controllers here. This keeps stale
 * lookup responses from racing back into the 5k-line panel shell.
 */
export function useManualNaceBusinessTypePrefill({
  businessTypesForSearch,
  formData,
  localizeActivityCodeCopy,
  selectedBusinessTypeId,
  selectedCompany,
  setFormData,
  setSelectedBusinessType,
  translate,
  updateFormData,
}: UseManualNaceBusinessTypePrefillParams): UseManualNaceBusinessTypePrefillResult {
  const backgroundAbortRef = useRef<AbortController | null>(null)
  const companySelectAbortRef = useRef<AbortController | null>(null)
  const [nacePrefillError, setNacePrefillError] = useState<string | null>(null)
  const [retryTrigger, setRetryTrigger] = useState(0)

  useEffect(() => {
    return () => {
      backgroundAbortRef.current?.abort()
      companySelectAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    // Intentional nonce read: retryNacePrefill bumps it to re-run this lookup.
    void retryTrigger
    const naceCode =
      formData.canonicalNaceCode?.trim() ||
      formData.naceCode?.trim() ||
      selectedCompany?.canonicalNaceCode?.trim() ||
      selectedCompany?.naceCode?.trim()
    if (!naceCode || formData.businessType?.trim()) {
      setNacePrefillError(null)
      return
    }

    if (companySelectAbortRef.current && !companySelectAbortRef.current.signal.aborted) return

    backgroundAbortRef.current?.abort()
    const controller = new AbortController()
    backgroundAbortRef.current = controller
    setNacePrefillError(null)

    naceBusinessTypeService
      .getBusinessTypeForNaceCode(
        naceCode,
        controller.signal,
        formData.country || formData.country_code,
        { guaranteeResolution: true }
      )
      .then((type) => {
        if (controller.signal.aborted) return
        if (type) {
          const mapped = normalizeBusinessTypeForForm(type)
          setSelectedBusinessType((prev) => prev ?? mapped)
          setFormData((prev) => {
            if (prev.businessType?.trim()) return prev
            return {
              ...prev,
              businessType: mapped.id,
              businessTypeCode: mapped.code || prev.businessTypeCode,
              industry: mapped.category || prev.industry,
            }
          })
          updateFormData({ business_type_id: mapped.id, industry: mapped.category })
          setNacePrefillError(null)
        } else {
          setNacePrefillError(localizeActivityCodeCopy(translate('errors.noBusinessTypeForNace')))
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setNacePrefillError(toNacePrefillError(err, translate, localizeActivityCodeCopy))
      })
      .finally(() => {
        if (backgroundAbortRef.current === controller) backgroundAbortRef.current = null
      })

    return () => controller.abort()
  }, [
    formData.businessType,
    formData.canonicalNaceCode,
    formData.country,
    formData.country_code,
    formData.naceCode,
    localizeActivityCodeCopy,
    retryTrigger,
    selectedCompany?.canonicalNaceCode,
    selectedCompany?.naceCode,
    setFormData,
    setSelectedBusinessType,
    translate,
    updateFormData,
  ])

  useEffect(() => {
    const btId = formData.businessType?.trim()
    if (!btId || selectedBusinessTypeId === btId) return
    const match = businessTypesForSearch.find((type) => type.id === btId)
    if (match) setSelectedBusinessType(match)
  }, [
    businessTypesForSearch,
    formData.businessType,
    selectedBusinessTypeId,
    setSelectedBusinessType,
  ])

  const prefillBusinessTypeForCompany = useCallback(
    async (company: KBOCompany, baseUpdates: Partial<ValuationFormData>, naceCode?: string) => {
      backgroundAbortRef.current?.abort()
      companySelectAbortRef.current?.abort()
      const controller = new AbortController()
      companySelectAbortRef.current = controller
      setNacePrefillError(null)

      const seeded = resolveSeededBusinessType(company, businessTypesForSearch)
      if (seeded) {
        applyBusinessType(seeded, baseUpdates, setFormData, setSelectedBusinessType, updateFormData)
        if (companySelectAbortRef.current === controller) companySelectAbortRef.current = null
        return
      }

      const code = naceCode?.trim()
      if (!code) {
        companySelectAbortRef.current = null
        return
      }

      try {
        const type = await naceBusinessTypeService.getBusinessTypeForNaceCode(
          code,
          controller.signal,
          company.countryCode || undefined,
          { guaranteeResolution: true }
        )
        if (controller.signal.aborted) return
        if (type) {
          const normalizedType = normalizeBusinessTypeForForm(type)
          const mapped =
            businessTypesForSearch.find((candidate) => candidate.id === normalizedType.id) ??
            normalizedType
          applyBusinessType(
            mapped,
            baseUpdates,
            setFormData,
            setSelectedBusinessType,
            updateFormData
          )
          setNacePrefillError(null)
        } else {
          setNacePrefillError(localizeActivityCodeCopy(translate('errors.noBusinessTypeForNace')))
        }
      } catch (err) {
        if (controller.signal.aborted) return
        setNacePrefillError(toNacePrefillError(err, translate, localizeActivityCodeCopy))
      } finally {
        if (companySelectAbortRef.current === controller) {
          companySelectAbortRef.current = null
        }
      }
    },
    [
      businessTypesForSearch,
      localizeActivityCodeCopy,
      setFormData,
      setSelectedBusinessType,
      translate,
      updateFormData,
    ]
  )

  const clearNacePrefillError = useCallback(() => setNacePrefillError(null), [])
  const retryNacePrefill = useCallback(() => setRetryTrigger((prev) => prev + 1), [])

  return {
    clearNacePrefillError,
    nacePrefillError,
    prefillBusinessTypeForCompany,
    retryNacePrefill,
  }
}

function resolveSeededBusinessType(
  company: KBOCompany,
  businessTypesForSearch: BusinessType[]
): BusinessType | null {
  const seededBtId = normalizeBusinessTypeId(company.businessTypeId)
  if (!seededBtId) return null
  return (
    businessTypesForSearch.find((type) => type.id === seededBtId) ??
    ({
      id: seededBtId,
      code: seededBtId,
      name: company.businessTypeTitle || seededBtId,
      category: 'services',
      icon: Building2,
      emoji: 'business',
      popular: false,
    } as BusinessType)
  )
}

function applyBusinessType(
  businessType: BusinessType,
  baseUpdates: Partial<ValuationFormData>,
  setFormData: Dispatch<SetStateAction<ValuationFormData>>,
  setSelectedBusinessType: Dispatch<SetStateAction<BusinessType | null>>,
  updateFormData: (patch: StoreFormPatch) => void
) {
  const mapped = normalizeBusinessTypeForForm(businessType)
  setSelectedBusinessType(mapped)
  setFormData((prev) => ({
    ...prev,
    ...baseUpdates,
    businessType: mapped.id,
    businessTypeCode: mapped.code || mapped.id,
    industry: mapped.category || 'services',
  }))
  updateFormData({ business_type_id: mapped.id, industry: mapped.category })
}

function normalizeBusinessTypeForForm(businessType: BusinessType): BusinessType {
  const id = normalizeBusinessTypeId(businessType.id) ?? businessType.id
  const code = normalizeBusinessTypeId(businessType.code) ?? businessType.code
  if (id === businessType.id && code === businessType.code) return businessType
  return { ...businessType, id, code }
}

function toNacePrefillError(
  err: unknown,
  translate: Translate,
  localizeActivityCodeCopy: (copy: string) => string
): string {
  if (err instanceof Error && err.message === 'BUSINESS_TYPE_FETCH_FAILED') {
    return localizeActivityCodeCopy(translate('errors.businessTypeFetchFailed'))
  }
  if (err instanceof Error) {
    return localizeActivityCodeCopy(err.message)
  }
  return localizeActivityCodeCopy(translate('errors.businessTypeFetchFailed'))
}
