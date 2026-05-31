'use client'

import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef } from 'react'
import type { KBOCompany } from '@/design-system'
import {
  looksLikeNaceCode,
  naceBusinessTypeService,
} from '../../../services/naceBusinessTypeService'
import type { ManualValuationFormData } from '../../../types/valuation'
import { shouldSuppressMercurySessionPrefill } from '../../../utils/prefillRestorationGate'
import {
  applyManualInitialPrefill,
  buildManualPrefillCompany,
  type ManualInitialPrefillData,
} from '../utils/manualInputPrefill'
import { normalizeBusinessTypeId } from '../../../utils/businessTypeIdAliases'

type StoreFormPatch = Record<string, unknown>

interface UseManualInitialPrefillBootstrapParams {
  countryUserOverrideRef: MutableRefObject<boolean>
  initialPrefill: ManualInitialPrefillData
  prefillCompanyRef: MutableRefObject<{ name: string; kbo: string } | null>
  sessionReportId?: string
  setCompanySearchValue: Dispatch<SetStateAction<string>>
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  setSelectedCompany: Dispatch<SetStateAction<KBOCompany | null>>
  updateFormData: (patch: StoreFormPatch) => void
}

export function useManualInitialPrefillBootstrap({
  countryUserOverrideRef,
  initialPrefill,
  prefillCompanyRef,
  sessionReportId,
  setCompanySearchValue,
  setFormData,
  setSelectedCompany,
  updateFormData,
}: UseManualInitialPrefillBootstrapParams) {
  const prefillAbortRef = useRef<boolean>(false)

  useEffect(() => {
    if (shouldSuppressMercurySessionPrefill(sessionReportId)) {
      prefillAbortRef.current = false
      return () => {
        prefillAbortRef.current = true
      }
    }

    prefillAbortRef.current = false
    const isCurrent = () => !prefillAbortRef.current

    const runPrefill = async () => {
      let businessTypeToApply = initialPrefill.businessType
      let industryToApply = initialPrefill.industry
      if (businessTypeToApply && looksLikeNaceCode(businessTypeToApply)) {
        const resolved = await naceBusinessTypeService.getBusinessTypeForNaceCode(
          businessTypeToApply.trim(),
          undefined,
          initialPrefill.country,
          { guaranteeResolution: true }
        )
        if (!isCurrent()) return
        if (resolved?.id) {
          businessTypeToApply = normalizeBusinessTypeId(resolved.id) ?? resolved.id
          industryToApply = resolved.category || initialPrefill.industry
          updateFormData({ business_type_id: businessTypeToApply, industry: industryToApply })
        } else {
          businessTypeToApply = ''
        }
      }
      businessTypeToApply = normalizeBusinessTypeId(businessTypeToApply) ?? businessTypeToApply
      if (businessTypeToApply && looksLikeNaceCode(businessTypeToApply)) {
        businessTypeToApply = ''
      }

      if (!isCurrent()) return
      let companyNameUpdate: string | undefined
      setFormData((prev) => {
        const result = applyManualInitialPrefill({
          previous: prev,
          countryUserOverridden: countryUserOverrideRef.current,
          businessTypeToApply: businessTypeToApply || undefined,
          industryToApply,
          prefill: initialPrefill,
        })
        companyNameUpdate = result.companyNameUpdate
        return result.next
      })
      if (companyNameUpdate) setCompanySearchValue(companyNameUpdate)
      const prefillCompany = buildManualPrefillCompany({
        businessTypeToApply: businessTypeToApply || undefined,
        companyName: companyNameUpdate,
        prefill: initialPrefill,
      })
      if (prefillCompany) {
        setSelectedCompany(prefillCompany)
        if (!prefillCompanyRef.current) {
          prefillCompanyRef.current = {
            name: prefillCompany.name,
            kbo: initialPrefill.kboNumber || '',
          }
        }
      }
    }
    runPrefill()
    return () => {
      prefillAbortRef.current = true
    }
  }, [
    countryUserOverrideRef,
    initialPrefill,
    prefillCompanyRef,
    sessionReportId,
    setCompanySearchValue,
    setFormData,
    setSelectedCompany,
    updateFormData,
  ])

  useEffect(() => {
    const name = initialPrefill.companyName?.trim()
    if (name) {
      setCompanySearchValue((prev) => (prev?.trim() ? prev : name))
    }
  }, [initialPrefill.companyName, setCompanySearchValue])

  useEffect(() => {
    const name = initialPrefill.companyName?.trim()
    const hasExpandData =
      initialPrefill.kboNumber ||
      initialPrefill.legalForm ||
      initialPrefill.businessType ||
      initialPrefill.industry
    if (!name || !hasExpandData) return

    setSelectedCompany((prev) => {
      if (prev) return prev
      if (!prefillCompanyRef.current) {
        prefillCompanyRef.current = { name, kbo: initialPrefill.kboNumber || '' }
      }
      return buildManualPrefillCompany({
        businessTypeToApply: normalizeBusinessTypeId(initialPrefill.businessType),
        companyName: name,
        prefill: initialPrefill,
      })
    })
  }, [initialPrefill, prefillCompanyRef, setSelectedCompany])
}
