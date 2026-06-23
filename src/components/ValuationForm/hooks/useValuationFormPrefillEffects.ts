import { useEffect, useRef, useState } from 'react'
import { useBootstrapPrefill } from '../../../hooks/useBootstrapPrefill'
import { useBootstrapSafe } from '../../../lib/bootstrap'
import type { BusinessType } from '../../../services/businessTypesApi'
import { businessTypesApiService } from '../../../services/businessTypesApi'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ValuationFormData } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { buildBusinessTypeFormData } from '../utils/businessTypeFormData'
import { getHttpStatus } from '../utils/businessTypeMatching'
import { getPrefilledQuery } from '../utils/recordAccess'
import {
  type BusinessCardPrefillPayload,
  hasMeaningfulBootstrapPrefill,
  isViewingExistingBootstrapReport,
  resolveBusinessCardBusinessTypeFormData,
  resolvePrefilledQueryBusinessTypeFormData,
} from '../ValuationFormPrefillModel'

interface UseValuationFormPrefillEffectsParams {
  formData: ValuationFormData
  updateFormData: (updates: Partial<ValuationFormData>) => void
  prefillFromBusinessCard: (businessCard: BusinessCardPrefillPayload) => void
  businessTypes: readonly BusinessType[]
  businessCard: BusinessCardPrefillPayload | null
  isAuthenticated: boolean
  reportId: string | null | undefined
  scheduleInitializationCompletion: (callback: () => void, delayMs: number) => void
}

export function useValuationFormPrefillEffects({
  formData,
  updateFormData,
  prefillFromBusinessCard,
  businessTypes,
  businessCard,
  isAuthenticated,
  reportId,
  scheduleInitializationCompletion,
}: UseValuationFormPrefillEffectsParams): { prefilledQuery: string | null } {
  const { prefillConfidence } = useBootstrapPrefill()
  const bootstrap = useBootstrapSafe()
  const prefilledQuery = useSessionStore((state) => getPrefilledQuery(state.session?.partialData))
  const [hasPrefilledOnce, setHasPrefilledOnce] = useState(false)
  const lastProcessedNaceRef = useRef<string | null>(null)
  const processedPrefilledQueryRef = useRef<string | null>(null)
  const completedNoQueryInitializationRef = useRef(false)

  const bootstrapHasMeaningfulPrefill = hasMeaningfulBootstrapPrefill({
    bootstrap,
    prefillConfidence,
  })
  const isViewingExistingReport = isViewingExistingBootstrapReport(bootstrap)

  useEffect(() => {
    if (bootstrapHasMeaningfulPrefill) {
      generalLogger.debug('Skipping business card prefill - bootstrap already prefilled', {
        prefillConfidence: prefillConfidence.toFixed(2),
      })
      return
    }

    if (isViewingExistingReport) {
      generalLogger.debug('Skipping business card prefill - viewing existing report')
      return
    }

    if (!isAuthenticated || !businessCard || hasPrefilledOnce || businessTypes.length === 0) {
      return
    }

    generalLogger.info('Pre-filling form with business card data (bootstrap fallback)', {
      company_name: businessCard.company_name?.substring(0, 20),
    })

    prefillFromBusinessCard(businessCard)

    const businessTypeFormData = resolveBusinessCardBusinessTypeFormData({
      businessCard,
      businessTypes,
    })
    if (businessTypeFormData) {
      updateFormData(businessTypeFormData)
    }

    setHasPrefilledOnce(true)
  }, [
    prefillConfidence,
    isAuthenticated,
    businessCard,
    hasPrefilledOnce,
    prefillFromBusinessCard,
    businessTypes,
    updateFormData,
    isViewingExistingReport,
    bootstrapHasMeaningfulPrefill,
  ])

  useEffect(() => {
    const naceCode = formData.nace_code?.trim()
    if (
      !naceCode ||
      formData.business_type_id ||
      businessTypes.length === 0 ||
      lastProcessedNaceRef.current === naceCode
    ) {
      return
    }

    lastProcessedNaceRef.current = naceCode
    let cancelled = false

    ;(async () => {
      try {
        const bt = await businessTypesApiService.getBusinessTypeForNaceCode(
          naceCode,
          formData.country_code || undefined,
          { guaranteeResolution: true }
        )
        if (cancelled || !bt) return

        const matchedType = businessTypes.find((t) => t.id === bt.id)
        if (matchedType) {
          generalLogger.info('[ValuationForm] Prefilled business type from NACE (full type)', {
            nace_code: naceCode,
            business_type_id: matchedType.id,
            title: matchedType.title,
          })
          updateFormData(buildBusinessTypeFormData(matchedType))
        } else {
          generalLogger.warn(
            '[ValuationForm] NACE type not in loaded list, using sparse NACE object',
            {
              nace_code: naceCode,
              business_type_id: bt.id,
            }
          )
          updateFormData(buildBusinessTypeFormData(bt))
        }
      } catch (err: unknown) {
        const status = getHttpStatus(err)
        const message = err instanceof Error ? err.message : String(err)
        const isNotFound =
          status === 404 ||
          message.toLowerCase().includes('not found') ||
          message.toLowerCase().includes('no mapping')
        if (!isNotFound) {
          generalLogger.warn('[ValuationForm] NACE lookup failed unexpectedly', {
            nace_code: naceCode,
            status,
            error: message,
          })
        }
      } finally {
        if (cancelled) lastProcessedNaceRef.current = null
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    formData.nace_code,
    formData.country_code,
    formData.business_type_id,
    businessTypes,
    updateFormData,
  ])

  useEffect(() => {
    if (businessTypes.length === 0) return

    if (
      prefilledQuery &&
      !formData.business_type_id &&
      processedPrefilledQueryRef.current !== prefilledQuery
    ) {
      generalLogger.info('Processing prefilledQuery from URL', {
        prefilledQuery,
        reportId,
      })

      const resolved = resolvePrefilledQueryBusinessTypeFormData({
        prefilledQuery,
        businessTypes,
      })

      processedPrefilledQueryRef.current = prefilledQuery
      if (resolved) {
        generalLogger.info('Prefilled business type from URL query', {
          query: prefilledQuery,
          matchedType: resolved.matchedType.title,
          id: resolved.matchedType.id,
        })

        updateFormData(resolved.formData)
      } else {
        generalLogger.warn('Could not match prefilledQuery to business type', {
          prefilledQuery,
        })
      }

      scheduleInitializationCompletion(() => {
        useSessionStore.getState().completeInitialization()
      }, 500)
      return
    }

    if (!prefilledQuery && !completedNoQueryInitializationRef.current) {
      completedNoQueryInitializationRef.current = true
      scheduleInitializationCompletion(() => {
        useSessionStore.getState().completeInitialization()
      }, 500)
    }
  }, [
    reportId,
    businessTypes,
    formData.business_type_id,
    prefilledQuery,
    scheduleInitializationCompletion,
    updateFormData,
  ])

  return { prefilledQuery }
}
