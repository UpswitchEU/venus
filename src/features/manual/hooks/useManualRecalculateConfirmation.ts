import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { SynthesisWeightSelection } from '@/lib/synthesis/synthesisWeights'
import type { ValuationFormData } from '../../../components/calculator'
import { useManualFormStore } from '../../../store/manual'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import type { ValuationVersion } from '../../../types/ValuationVersion'
import { generalLogger } from '../../../utils/logger'
import {
  hasExistingValuationVersion,
  shouldOpenVersionConfirmation,
} from '../../../utils/versionConfirmation'
import { areChangesSignificant, detectVersionChanges } from '../../../utils/versionDiffDetection'
import { mapClarityFormToVenusStore } from '../utils/manualFormMapper'
import { buildManualCalculationRequest } from '../utils/manualValuationRequest'

type ManualSubmitHandler = (data: ValuationFormData) => Promise<void> | void

type ManualHistoryTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string

export interface ManualRecalculatePopupFlags {
  hasFormChanges: boolean
  hasNormalizations: boolean
}

export interface UseManualRecalculateConfirmationParams {
  currentLocale: string
  getLatestVersion: (reportId: string) => ValuationVersion | null
  handleManualSubmit: ManualSubmitHandler
  hasAnyNormalization: boolean
  isDirty: boolean
  preSelectedMethod?: string | null
  report: unknown
  reportId?: string | null
  resolvedReportId?: string | null
  selectedMethod: string
  synthesisSelection: SynthesisWeightSelection
  translateHistory: ManualHistoryTranslator
  updateFormData: (patch: ReturnType<typeof mapClarityFormToVenusStore>) => void
}

export interface UseManualRecalculateConfirmationResult {
  currentVersionNumber: number
  handleCancelRecalculate: () => void
  handleConfirmRecalculate: () => void
  popupFlags: ManualRecalculatePopupFlags
  showRecalculateConfirmation: boolean
  wrappedOnSubmit: (data: ValuationFormData) => Promise<void>
}

export function useManualRecalculateConfirmation({
  currentLocale,
  getLatestVersion,
  handleManualSubmit,
  hasAnyNormalization,
  isDirty,
  preSelectedMethod,
  report,
  reportId,
  resolvedReportId,
  selectedMethod,
  synthesisSelection,
  translateHistory,
  updateFormData,
}: UseManualRecalculateConfirmationParams): UseManualRecalculateConfirmationResult {
  const [showRecalculateConfirmation, setShowRecalculateConfirmation] = useState(false)
  const pendingSubmitDataRef = useRef<ValuationFormData | null>(null)
  const pendingPopupFlagsRef = useRef<ManualRecalculatePopupFlags>({
    hasFormChanges: false,
    hasNormalizations: false,
  })
  const recalculateConfirmationOpenRef = useRef(false)
  const submitInProgressRef = useRef(false)

  const currentVersion = resolvedReportId ? getLatestVersion(resolvedReportId) : null
  const currentVersionNumber = currentVersion?.versionNumber ?? 0
  const hasExistingValuation = hasExistingValuationVersion(currentVersion)

  const openRecalculateConfirmation = useCallback(
    (data: ValuationFormData, flags: ManualRecalculatePopupFlags, versionNumber: number) => {
      generalLogger.info('[ManualLayout] Changes detected, showing recalculation confirmation', {
        hasFormChanges: flags.hasFormChanges,
        hasNormalizations: flags.hasNormalizations,
        currentVersionNumber: versionNumber,
      })
      pendingSubmitDataRef.current = data
      pendingPopupFlagsRef.current = flags
      recalculateConfirmationOpenRef.current = true
      setShowRecalculateConfirmation(true)
    },
    []
  )

  const wrappedOnSubmit = useCallback(
    async (data: ValuationFormData) => {
      if (recalculateConfirmationOpenRef.current || submitInProgressRef.current) {
        return
      }
      submitInProgressRef.current = true
      try {
        if (!reportId) {
          await handleManualSubmit(data)
          return
        }
        if (report && isDirty && hasExistingValuation) {
          openRecalculateConfirmation(
            data,
            {
              hasFormChanges: true,
              hasNormalizations: hasAnyNormalization,
            },
            currentVersionNumber
          )
          return
        }

        const idForVersions = resolvedReportId || reportId
        if (!idForVersions || typeof idForVersions !== 'string' || idForVersions.trim() === '') {
          await handleManualSubmit(data)
          return
        }

        await fetchVersionsForConfirmation(idForVersions, translateHistory)

        const latestVersion = getLatestVersion(idForVersions)
        const hasExistingValuationNow = hasExistingValuationVersion(latestVersion)
        if (!hasExistingValuationNow) {
          await handleManualSubmit(data)
          return
        }

        const venusFormData = mapClarityFormToVenusStore(
          data,
          useManualFormStore.getState().formData
        )
        updateFormData(venusFormData)
        const storeSnapshot = useManualFormStore.getState().formData
        const validLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const request = buildManualCalculationRequest({
          formData: storeSnapshot,
          locale: validLocale as 'nl' | 'en',
          selectedMethod: preSelectedMethod ?? selectedMethod,
          identifiers: { reportId: idForVersions },
          synthesisSelection,
        })

        const previousVersion = getLatestVersion(idForVersions)
        if (!previousVersion) {
          await handleManualSubmit(data)
          return
        }
        const changes = detectVersionChanges(previousVersion.formData, request)
        const hasFormChanges = areChangesSignificant(changes)

        if (
          report &&
          shouldOpenVersionConfirmation({
            currentVersion: previousVersion,
            hasFormChanges,
            hasAnyNormalization,
            isConfirmationOpen: recalculateConfirmationOpenRef.current,
          })
        ) {
          openRecalculateConfirmation(
            data,
            { hasFormChanges, hasNormalizations: hasAnyNormalization },
            previousVersion.versionNumber
          )
          return
        }
        await handleManualSubmit(data)
      } finally {
        submitInProgressRef.current = false
      }
    },
    [
      currentLocale,
      currentVersionNumber,
      getLatestVersion,
      handleManualSubmit,
      hasAnyNormalization,
      hasExistingValuation,
      isDirty,
      openRecalculateConfirmation,
      preSelectedMethod,
      report,
      reportId,
      resolvedReportId,
      selectedMethod,
      synthesisSelection,
      translateHistory,
      updateFormData,
    ]
  )

  const handleConfirmRecalculate = useCallback(() => {
    const pending = pendingSubmitDataRef.current
    recalculateConfirmationOpenRef.current = false
    setShowRecalculateConfirmation(false)
    pendingSubmitDataRef.current = null
    if (pending) void handleManualSubmit(pending)
  }, [handleManualSubmit])

  const handleCancelRecalculate = useCallback(() => {
    recalculateConfirmationOpenRef.current = false
    setShowRecalculateConfirmation(false)
    pendingSubmitDataRef.current = null
  }, [])

  return {
    currentVersionNumber,
    handleCancelRecalculate,
    handleConfirmRecalculate,
    popupFlags: pendingPopupFlagsRef.current,
    showRecalculateConfirmation,
    wrappedOnSubmit,
  }
}

async function fetchVersionsForConfirmation(
  reportId: string,
  translateHistory: ManualHistoryTranslator
) {
  await useVersionHistoryStore
    .getState()
    .fetchVersions(reportId)
    .catch((err) => {
      generalLogger.warn('[ManualLayout] Pre-submit fetchVersions failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      toast.warning(translateHistory('loadError'), {
        description: err instanceof Error ? err.message : undefined,
      })
    })
}
