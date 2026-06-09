import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { toast } from 'sonner'
import type { ValuationReportData } from '../../../components/calculator'
import { backendAPI } from '../../../services/backendApi'
import {
  buildPersistedPreparerMultiplePayload,
  buildPreparerMultiplePayload,
  type PreparerEbitdaReasonKey,
} from '../../../store/manual/usePreparerMultipleStore'
import type { ValuationResponse } from '../../../types/valuation'
import { getValuationMethodResultForKey } from '../../../utils/extractValuationResultsMap'
import { generalLogger } from '../../../utils/logger'
import type { ManualStarterPaywallReason } from '../components/ManualStarterPaywallModal'
import { useManualResultsStore } from '../../../store/manual/useManualResultsStore'
import { resolveSynthesisAwarePresentation } from '../components/manualReportPresentation'
import {
  getManualHydratedValuationResults,
  getManualModalEditPersistToast,
  serializeManualPreparerPayload,
} from '../utils/manualLayoutAdapters'
import { shouldBlockExtremePreparerMultiple } from '../utils/manualPreparerMultipleGuard'
import { useManualMethodSelectionActions } from './useManualMethodSelectionActions'
import { useManualReportRefreshAfterEdit } from './useManualReportRefreshAfterEdit'
import { useLatestRef } from './useNavigationCancellation'
import {
  type PersistIntent,
  useValuationPersistenceCoordinator,
} from './useValuationPersistenceCoordinator'

interface PreparerMultipleState {
  acknowledgedExtreme: boolean
  appliedMedian: number | null
  benchmarkMedian: number | null
  note: string
  reasonKey: PreparerEbitdaReasonKey | ''
}

type ToastTranslator = (key: string) => string

export interface UseManualMethodPersistenceControllerParams {
  allowedMethodKeys: readonly string[] | null
  canDownloadPdf: boolean
  generatePdf: () => Promise<string | null>
  isPdfGenerating?: boolean
  openStarterPaywall: (reason: ManualStarterPaywallReason) => void
  persistedReportLookupId: string | null | undefined
  preSelectableMethodsForNav: readonly string[]
  preSelectedMethod: string | null
  preparer: PreparerMultipleState
  report: ValuationReportData | null
  restorationComplete: boolean
  result: ValuationResponse | null
  selectedMethod: string
  setPreSelectedMethod: (method: string | null) => void
  setReport: Dispatch<SetStateAction<ValuationReportData | null>>
  setResult: (result: ValuationResponse | null) => void
  setSelectedMethod: (method: string) => void
  showValuationEditModal: boolean
  togglePreSelectedMethod: (method: string) => void
  translate: ToastTranslator
}

export interface UseManualMethodPersistenceControllerResult {
  handlePlanLockedMethodAction: () => void
  handlePreSelectMethod: (methodKey: string) => void
  handleSelectMethodWithOverride: (
    methodKey: string,
    overrideReason?: string,
    overrideNote?: string
  ) => void
  isMethodSwitchRendering: boolean
  togglePreSelectedMethodWithPlanGate: (methodKey: string) => void
}

function toastModalEditPersistError(err: unknown, translate: ToastTranslator) {
  const toastConfig = getManualModalEditPersistToast(err)
  if (toastConfig.descriptionKey) {
    toast.error(translate(toastConfig.titleKey), {
      description: translate(toastConfig.descriptionKey),
    })
    return
  }
  toast.error(translate(toastConfig.titleKey))
}

export function useManualMethodPersistenceController({
  allowedMethodKeys,
  canDownloadPdf,
  generatePdf,
  isPdfGenerating = false,
  openStarterPaywall,
  persistedReportLookupId,
  preSelectableMethodsForNav,
  preSelectedMethod,
  preparer,
  report,
  restorationComplete,
  result,
  selectedMethod,
  setPreSelectedMethod,
  setReport,
  setResult,
  setSelectedMethod,
  showValuationEditModal,
  togglePreSelectedMethod,
  translate,
}: UseManualMethodPersistenceControllerParams): UseManualMethodPersistenceControllerResult {
  const prevSelectedMethodRef = useRef(selectedMethod)
  const lastEnqueuedSelectedMethodRef = useRef<string | null>(null)
  const userInitiatedMethodChangeRef = useRef(false)
  const userInitiatedPreviousMethodRef = useRef<string | null>(null)
  const selectedMethodRef = useLatestRef(selectedMethod)

  useEffect(() => {
    if (!report) return
    const hydrated = getManualHydratedValuationResults(result) ?? {}
    if (!Object.keys(hydrated).length) return
    if (selectedMethod === prevSelectedMethodRef.current) return
    prevSelectedMethodRef.current = selectedMethod

    const methodData = getValuationMethodResultForKey(hydrated, selectedMethod)
    const rawVal = methodData?.value
    const n = rawVal == null ? NaN : Number(rawVal)
    if (!methodData?.available || !Number.isFinite(n)) return
    const { preSelectedMethods, userWeights } = useManualResultsStore.getState()
    const presentation = resolveSynthesisAwarePresentation(result, selectedMethod, {
      preSelectedMethods,
      userWeights,
    })

    setReport((prev) =>
      prev
        ? {
            ...prev,
            valuation: presentation.valuation,
            valuationLow: presentation.valuationLow,
            valuationHigh: presentation.valuationHigh,
            multiple: presentation.multiple ?? prev.multiple,
            multipleRange: presentation.multipleRange ?? prev.multipleRange,
            recommendedAskingPrice: presentation.valuation,
          }
        : prev
    )
  }, [selectedMethod, result, report, setReport])

  const pendingOverrideRef = useRef<{ reason?: string; note?: string }>({})
  const { refreshReportAfterEdit } = useManualReportRefreshAfterEdit({
    canDownloadPdf,
    generatePdf,
    isPdfGenerating,
    persistedReportLookupId,
    setReport,
    setResult,
  })
  const resultMethodRef = useLatestRef<string | undefined>(
    (result as { selected_valuation_method?: string } | null)?.selected_valuation_method
  )

  const { enqueueMethod, enqueuePreparer, setBaseline, isPersisting } =
    useValuationPersistenceCoordinator({
      reportId: persistedReportLookupId ?? null,
      initialBaseline: {
        method: selectedMethod,
        preparerSignature: serializeManualPreparerPayload(
          buildPersistedPreparerMultiplePayload(result)
        ),
      },
      runner: async (intent: PersistIntent, signal: AbortSignal) => {
        if (!persistedReportLookupId) return
        const preparerOptions: Parameters<typeof backendAPI.updateSelectedMethod>[4] =
          intent.kind === 'preparer'
            ? intent.payload != null
              ? (intent.payload as Parameters<typeof backendAPI.updateSelectedMethod>[4])
              : intent.clear
                ? { clear_preparer_override: true }
                : undefined
            : undefined
        const overrideReason = intent.kind === 'method' ? intent.overrideReason : undefined
        const overrideNote = intent.kind === 'method' ? intent.overrideNote : undefined
        const res = await backendAPI.updateSelectedMethod(
          persistedReportLookupId,
          intent.method,
          overrideReason,
          overrideNote,
          preparerOptions
        )
        if (signal.aborted) return
        await refreshReportAfterEdit(res?.html_report)
      },
      onError: (intent, error) => {
        if (intent.kind === 'method') {
          const errMsg = error instanceof Error ? error.message : String(error)
          generalLogger.error('[ManualLayout] Method persist failed', {
            error: errMsg,
            selectedMethod: intent.method,
          })
          // Roll UI back without re-enqueueing the revert as a new persist intent.
          lastEnqueuedSelectedMethodRef.current = intent.previousMethod
          userInitiatedMethodChangeRef.current = false
          setSelectedMethod(intent.previousMethod)
          if (errMsg.includes('plan does not include')) {
            openStarterPaywall('methods')
          } else {
            toast.error(translate('persistFailed'), { description: translate('persistFailedDesc') })
          }
        } else {
          generalLogger.error('[ManualLayout] Preparer multiple persist failed', {
            error: error instanceof Error ? error.message : String(error),
            selectedMethod: intent.method,
          })
          toastModalEditPersistError(error, translate)
        }
      },
    })

  const enqueueMethodRef = useLatestRef(enqueueMethod)
  const enqueuePreparerRef = useLatestRef(enqueuePreparer)
  const setBaselineRef = useLatestRef(setBaseline)

  useEffect(() => {
    lastEnqueuedSelectedMethodRef.current = null
    userInitiatedMethodChangeRef.current = false
    userInitiatedPreviousMethodRef.current = null
  }, [persistedReportLookupId])

  useEffect(() => {
    if (!restorationComplete) {
      lastEnqueuedSelectedMethodRef.current = null
      userInitiatedMethodChangeRef.current = false
      userInitiatedPreviousMethodRef.current = null
    }
  }, [restorationComplete])

  useEffect(() => {
    setBaselineRef.current({
      method: resultMethodRef.current,
      preparerSignature: serializeManualPreparerPayload(
        buildPersistedPreparerMultiplePayload(result)
      ),
    })
  }, [result, resultMethodRef, setBaselineRef])

  useEffect(() => {
    if (!persistedReportLookupId || !restorationComplete) return

    const userInitiatedAtEffectStart = userInitiatedMethodChangeRef.current
    const serverMethod = resultMethodRef.current
    if (lastEnqueuedSelectedMethodRef.current === null) {
      // Wait for result hydration before arming — avoids seeding with a stale
      // selectedMethod when the server method arrives on the next setResult tick.
      if (!result && !serverMethod && !userInitiatedAtEffectStart) return
      // Wait until UI selectedMethod matches the persisted server method so
      // setResult hydration does not look like a user-initiated method change.
      if (serverMethod && selectedMethod !== serverMethod && !userInitiatedAtEffectStart) return

      lastEnqueuedSelectedMethodRef.current = userInitiatedAtEffectStart
        ? (serverMethod ?? userInitiatedPreviousMethodRef.current ?? selectedMethod)
        : (serverMethod ?? selectedMethod)
      userInitiatedPreviousMethodRef.current = null

      if (!userInitiatedAtEffectStart && lastEnqueuedSelectedMethodRef.current === selectedMethod) {
        userInitiatedMethodChangeRef.current = false
        return
      }
    }

    if (lastEnqueuedSelectedMethodRef.current === selectedMethod) {
      userInitiatedMethodChangeRef.current = false
      return
    }

    // Hydration / store sync / error rollback — track without persisting.
    if (!userInitiatedAtEffectStart) {
      lastEnqueuedSelectedMethodRef.current = selectedMethod
      userInitiatedMethodChangeRef.current = false
      return
    }

    userInitiatedMethodChangeRef.current = false
    lastEnqueuedSelectedMethodRef.current = selectedMethod
    const { reason, note } = pendingOverrideRef.current
    pendingOverrideRef.current = {}
    enqueueMethodRef.current({
      method: selectedMethod,
      previousMethod: resultMethodRef.current ?? selectedMethod,
      overrideReason: reason,
      overrideNote: note,
    })
  }, [
    selectedMethod,
    persistedReportLookupId,
    restorationComplete,
    result,
    resultMethodRef,
    enqueueMethodRef,
  ])

  useEffect(() => {
    if (!showValuationEditModal || !persistedReportLookupId || !restorationComplete) return
    const mv = result?.multiples_valuation
    const currentPayload = buildPreparerMultiplePayload({
      benchmarkMedian: preparer.benchmarkMedian,
      appliedMedian: preparer.appliedMedian,
      reasonKey: preparer.reasonKey,
      note: preparer.note,
      acknowledgedExtreme: preparer.acknowledgedExtreme,
    })
    if (
      currentPayload &&
      shouldBlockExtremePreparerMultiple(
        {
          benchmarkMedian: preparer.benchmarkMedian,
          appliedMedian: preparer.appliedMedian,
          reasonKey: preparer.reasonKey,
          acknowledgedExtreme: preparer.acknowledgedExtreme,
        },
        mv
      )
    ) {
      return
    }
    const currentSignature = serializeManualPreparerPayload(currentPayload)
    const serverSignature = serializeManualPreparerPayload(
      buildPersistedPreparerMultiplePayload(result)
    )
    if (currentSignature === serverSignature) return

    enqueuePreparerRef.current({
      method: selectedMethod,
      payload: currentPayload as Record<string, unknown> | null,
      clear: currentPayload == null,
      signature: currentSignature,
    })
  }, [
    enqueuePreparerRef,
    persistedReportLookupId,
    preparer,
    result,
    selectedMethod,
    showValuationEditModal,
    restorationComplete,
  ])

  const markUserMethodChange = useCallback(() => {
    userInitiatedPreviousMethodRef.current = selectedMethodRef.current
    userInitiatedMethodChangeRef.current = true
  }, [selectedMethodRef])

  const methodActions = useManualMethodSelectionActions({
    allowedMethodKeys,
    openStarterPaywall,
    pendingOverrideRef,
    preSelectableMethodsForNav,
    preSelectedMethod,
    setPreSelectedMethod,
    setSelectedMethod,
    togglePreSelectedMethod,
  })

  const handleSelectMethodWithOverride = useCallback(
    (methodKey: string, overrideReason?: string, overrideNote?: string) => {
      markUserMethodChange()
      methodActions.handleSelectMethodWithOverride(methodKey, overrideReason, overrideNote)
    },
    [markUserMethodChange, methodActions.handleSelectMethodWithOverride]
  )

  const handlePreSelectMethod = useCallback(
    (methodKey: string) => {
      if (methodKey !== selectedMethodRef.current) {
        markUserMethodChange()
      }
      methodActions.handlePreSelectMethod(methodKey)
    },
    [markUserMethodChange, methodActions.handlePreSelectMethod, selectedMethodRef]
  )

  const togglePreSelectedMethodWithPlanGate = useCallback(
    (methodKey: string) => {
      methodActions.togglePreSelectedMethodWithPlanGate(methodKey)
    },
    [methodActions.togglePreSelectedMethodWithPlanGate]
  )

  return {
    ...methodActions,
    handleSelectMethodWithOverride,
    handlePreSelectMethod,
    togglePreSelectedMethodWithPlanGate,
    isMethodSwitchRendering: isPersisting,
  }
}
