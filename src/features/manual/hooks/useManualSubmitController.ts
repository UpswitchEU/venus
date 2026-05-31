import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import type { SynthesisWeightSelection } from '@/lib/synthesis/synthesisWeights'
import type { ValuationResponse } from '@/types/valuation'
import type { ValuationFormData } from '../../../components/calculator'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import {
  mergePreparerMultipleIntoRequest,
  usePreparerMultipleStore,
} from '../../../store/manual/usePreparerMultipleStore'
import { generalLogger } from '../../../utils/logger'
import { detectVersionChanges } from '../../../utils/versionDiffDetection'
import type { CollectedData } from '../components/manualLayoutDataTypes'
import type { SubmittedFinancialSnapshot } from '../utils/manualFinancialSnapshot'
import { mapClarityFormToVenusStore } from '../utils/manualFormMapper'
import { shouldBlockExtremePreparerMultiple } from '../utils/manualPreparerMultipleGuard'
import {
  getManualSubmitValidationIssue,
  MANUAL_SUBMIT_VALIDATION_TOAST_KEYS,
} from '../utils/manualSubmitValidation'
import {
  buildManualCalculationRequest,
  type ManualCalculationIdentifiers,
} from '../utils/manualValuationRequest'
import type { ManualVersionBaseline } from '../utils/manualVersioningDecision'
import { useManualCalculationCompletion } from './useManualCalculationCompletion'
import { useManualCalculationExecution } from './useManualCalculationExecution'
import { useManualSubmitErrorHandler } from './useManualSubmitErrorHandler'
import { useManualSubmitRunGuard } from './useManualSubmitRunGuard'

type ManualSubmitTranslate = (
  key: string,
  values?: Record<string, string | number | Date>
) => string
type SimpleTranslate = (key: string) => string

export interface UseManualSubmitControllerParams {
  calculationRequestIdentifiers: ManualCalculationIdentifiers
  createVersion: Parameters<typeof useManualCalculationCompletion>[0]['createVersion']
  currentLocale: string
  getLatestVersion: (reportId: string) => ManualVersionBaseline | null
  isAccountantMode: boolean
  linkedIdentifier: string | null
  lastSubmittedFinancialSnapshotRef: MutableRefObject<SubmittedFinancialSnapshot | null>
  preSelectedMethod: string | null | undefined
  reportId: string
  resolvedReportId: string | null | undefined
  result: ValuationResponse | null
  selectedMethod: string
  sessionName?: string
  durableSaveInFlightRef: MutableRefObject<boolean>
  setCalculating: (calculating: boolean) => void
  setCollectedData: Dispatch<SetStateAction<CollectedData>>
  setDraftStatus: Dispatch<SetStateAction<'draft' | 'saved' | 'saving'>>
  setIsDirty: (isDirty: boolean) => void
  setIsGenerating: Dispatch<SetStateAction<boolean>>
  setLastSaved: Dispatch<SetStateAction<Date | undefined>>
  setResult: (result: ValuationResponse | null) => void
  synthesisSelection: SynthesisWeightSelection
  translate: ManualSubmitTranslate
  translateErrors: SimpleTranslate
  translateHistory: ManualSubmitTranslate
  translatePreparer: SimpleTranslate
  translateReport: SimpleTranslate
  trySetCalculating: () => boolean
  updateFormData: (updates: Partial<ValuationFormData>) => void
  userId?: string
  versionSyncTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  warnIfSubmitSynthesisSkipped: (result: ValuationResponse) => void
}

export interface UseManualSubmitControllerResult {
  handleManualSubmit: (data: ValuationFormData) => Promise<void>
  lastSubmittedDataRef: MutableRefObject<ValuationFormData | null>
  pendingPostValuationAgentPrompt: string | null
  postValuationListingHandoffPendingRef: MutableRefObject<boolean>
  setPendingPostValuationAgentPrompt: Dispatch<SetStateAction<string | null>>
}

export function useManualSubmitController({
  calculationRequestIdentifiers,
  createVersion,
  currentLocale,
  getLatestVersion,
  isAccountantMode,
  linkedIdentifier,
  lastSubmittedFinancialSnapshotRef,
  preSelectedMethod,
  reportId,
  resolvedReportId,
  result,
  selectedMethod,
  sessionName,
  durableSaveInFlightRef,
  setCalculating,
  setCollectedData,
  setDraftStatus,
  setIsDirty,
  setIsGenerating,
  setLastSaved,
  setResult,
  synthesisSelection,
  translate,
  translateErrors,
  translateHistory,
  translatePreparer,
  translateReport,
  trySetCalculating,
  updateFormData,
  userId,
  versionSyncTimeoutRef,
  warnIfSubmitSynthesisSkipped,
}: UseManualSubmitControllerParams): UseManualSubmitControllerResult {
  const lastSubmittedDataRef = useRef<ValuationFormData | null>(null)
  const postValuationListingHandoffPendingRef = useRef(false)
  const [pendingPostValuationAgentPrompt, setPendingPostValuationAgentPrompt] = useState<
    string | null
  >(null)

  const endManualSubmitLoading = useCallback(() => {
    setCalculating(false)
    setIsGenerating(false)
  }, [setCalculating, setIsGenerating])

  const beginManualSubmitRun = useManualSubmitRunGuard({
    lookupId: resolvedReportId || reportId,
    endLoading: endManualSubmitLoading,
  })

  const { completeManualCalculation } = useManualCalculationCompletion({
    createVersion,
    isAccountantMode,
    lastSubmittedFinancialSnapshotRef,
    postValuationListingHandoffPendingRef,
    sessionName,
    durableSaveInFlightRef,
    setDraftStatus,
    setIsDirty,
    setLastSaved,
    setPendingPostValuationAgentPrompt,
    setResult,
    translate,
    translateHistory,
    translateReport,
    userId,
    versionSyncTimeoutRef,
  })

  const { runManualCalculationExecution } = useManualCalculationExecution({
    translate,
  })

  const { handleManualSubmitError } = useManualSubmitErrorHandler({
    translate,
    translateErrors,
    translatePreparer,
  })

  const handleManualSubmit = useCallback(
    async (data: ValuationFormData) => {
      const effectiveMethod =
        useManualResultsStore.getState().preSelectedMethod ??
        useManualResultsStore.getState().selectedMethod
      const storeFormDataBeforeSubmit = useManualFormStore.getState().formData
      const submittedBusinessTypeId =
        data.business_type_id?.trim() || storeFormDataBeforeSubmit.business_type_id?.trim() || ''
      const submittedBusinessType =
        data.businessType?.trim() ||
        (typeof data.businessTypeCode === 'string' ? data.businessTypeCode.trim() : '') ||
        submittedBusinessTypeId
      const validationIssue = getManualSubmitValidationIssue(
        {
          ...data,
          businessTypeId: submittedBusinessTypeId,
        },
        effectiveMethod
      )
      if (validationIssue) {
        const toastKeys = MANUAL_SUBMIT_VALIDATION_TOAST_KEYS[validationIssue]
        toast.warning(translate(toastKeys.title), { description: translate(toastKeys.description) })
        return
      }

      const wasSet = trySetCalculating()
      if (!wasSet) return

      const submitRun = beginManualSubmitRun()
      lastSubmittedDataRef.current = data
      setIsGenerating(true)

      setCollectedData({
        companyName: data.companyName,
        businessType: submittedBusinessType,
        industry: data.industry,
        businessModel:
          (typeof data.business_model === 'string' && data.business_model) ||
          (typeof data.businessModel === 'string' && data.businessModel) ||
          useManualFormStore.getState().formData.business_model,
        country: data.country,
        yearFounded: data.yearFounded,
        ownerManagers: data.ownerManagers,
        fteEmployees: data.fteEmployees,
      })

      try {
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
          identifiers: calculationRequestIdentifiers,
          synthesisSelection,
        })

        const idForApi = linkedIdentifier
        mergePreparerMultipleIntoRequest(request as unknown as Record<string, unknown>)
        const prep = usePreparerMultipleStore.getState()
        if (shouldBlockExtremePreparerMultiple(prep, result?.multiples_valuation)) {
          submitRun.endLoading()
          toast.error(translatePreparer('extremeWarning'))
          return
        }

        const previousVersion = idForApi ? getLatestVersion(idForApi) : null
        if (idForApi && previousVersion) {
          const changes = detectVersionChanges(previousVersion.formData, request)
          generalLogger.info('Regeneration detected', {
            reportId,
            previousVersion: previousVersion.versionNumber,
            totalChanges: changes.totalChanges,
          })
        }

        const retrySubmit = () => {
          if (lastSubmittedDataRef.current) {
            void handleManualSubmit(lastSubmittedDataRef.current)
          }
        }

        const calculationResult = await runManualCalculationExecution({
          idForApi,
          request,
          retrySubmit,
          submitRun,
        })
        if (calculationResult.aborted || !calculationResult.valuationResult) return

        const calcResult = calculationResult.valuationResult
        warnIfSubmitSynthesisSkipped(calcResult)

        const completionResult = await completeManualCalculation({
          calculationDurationMs: calculationResult.calculationDurationMs,
          idForApi,
          previousVersion,
          request,
          retrySubmit,
          storeSnapshot,
          submitRun,
          valuationResult: calcResult,
        })
        if (completionResult.aborted) return
      } catch (error) {
        handleManualSubmitError({
          error,
          retrySubmit: () => {
            if (lastSubmittedDataRef.current) {
              void handleManualSubmit(lastSubmittedDataRef.current)
            }
          },
          submitRun,
        })
      }
    },
    [
      beginManualSubmitRun,
      calculationRequestIdentifiers,
      completeManualCalculation,
      currentLocale,
      getLatestVersion,
      handleManualSubmitError,
      linkedIdentifier,
      preSelectedMethod,
      reportId,
      result,
      runManualCalculationExecution,
      selectedMethod,
      setCollectedData,
      setIsGenerating,
      synthesisSelection,
      translate,
      translatePreparer,
      trySetCalculating,
      updateFormData,
      warnIfSubmitSynthesisSkipped,
    ]
  )

  return {
    handleManualSubmit,
    lastSubmittedDataRef,
    pendingPostValuationAgentPrompt,
    postValuationListingHandoffPendingRef,
    setPendingPostValuationAgentPrompt,
  }
}
