import { type MutableRefObject, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { NormalizationItem, ValuationReportData } from '../../../components/calculator'
import type { SynthesisWeightSelection } from '../../../lib/synthesis/synthesisWeights'
import { reportService, valuationService } from '../../../services'
import {
  mergePreparerMultipleIntoRequest,
  usePreparerMultipleStore,
} from '../../../store/manual/usePreparerMultipleStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import type { ValuationFormData, ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { persistOrDeleteNormalizationsForYears } from '../../../utils/normalizationPersist'
import { mapClarityFormToVenusStore } from '../utils/manualFormMapper'
import {
  buildAcceptedNormalizationSignature,
  buildManualNormalizationPersistenceYears,
} from '../utils/manualNormalizationPersistence'
import { buildManualNormalizationRecalcSource } from '../utils/manualNormalizationRecalcSource'
import { shouldBlockExtremePreparerMultiple } from '../utils/manualPreparerMultipleGuard'
import { buildManualReportAssets } from '../utils/manualReportAssets'
import { buildManualTaxLatencySignature } from '../utils/manualTaxLatencySignature'
import {
  buildManualCalculationRequest,
  type ManualCalculationIdentifiers,
} from '../utils/manualValuationRequest'
import { useIsMountedRef, useLatestRef } from './useNavigationCancellation'

type ManualNormalizationRecalculationTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string
type ManualPreparerMultipleTranslator = (key: string) => string
type DraftStatus = 'draft' | 'saved' | 'saving'

export interface UseManualNormalizationRecalculationParams<TCollectedData extends object> {
  calculationRequestIdentifiers: ManualCalculationIdentifiers
  collectedData: TCollectedData
  currentLocale: string
  financialYears: number[]
  formStoreData: ValuationFormData
  latestFormDataRef: MutableRefObject<Partial<TCollectedData>>
  originalEBITDAByYear: Record<number, number>
  preSelectedMethod?: string | null
  report: ValuationReportData | null
  reportId: string
  resolvedReportId?: string | null
  resultMultiplesValuation?: Parameters<typeof shouldBlockExtremePreparerMultiple>[1]
  selectedMethod?: string | null
  sessionName?: string | null
  setDraftStatus: (status: DraftStatus) => void
  setLastSaved: (date: Date | undefined) => void
  setResult: (result: ValuationResponse | null) => void
  synthesisSelection: SynthesisWeightSelection
  translate: ManualNormalizationRecalculationTranslator
  translatePreparer: ManualPreparerMultipleTranslator
}

export interface UseManualNormalizationRecalculationResult {
  handleNormalizationsChange: (normalizations: NormalizationItem[]) => Promise<void>
  recalculateWithNormalizations: (normalizations: NormalizationItem[]) => Promise<void>
}

export function useManualNormalizationRecalculation<TCollectedData extends object>({
  calculationRequestIdentifiers,
  collectedData,
  currentLocale,
  financialYears,
  formStoreData,
  latestFormDataRef,
  originalEBITDAByYear,
  preSelectedMethod,
  report,
  reportId,
  resolvedReportId,
  resultMultiplesValuation,
  selectedMethod,
  sessionName,
  setDraftStatus,
  setLastSaved,
  setResult,
  synthesisSelection,
  translate,
  translatePreparer,
}: UseManualNormalizationRecalculationParams<TCollectedData>): UseManualNormalizationRecalculationResult {
  const recalcMountedRef = useIsMountedRef()
  const recalcLookupIdRef = useLatestRef<string | undefined>(resolvedReportId || reportId)

  const recalculateWithNormalizations = useCallback(
    async (normalizations: NormalizationItem[]) => {
      const idForApi = resolvedReportId || reportId
      if (!report || !idForApi) return

      const startLookupId = idForApi
      const isStillRelevant = () =>
        recalcMountedRef.current && recalcLookupIdRef.current === startLookupId

      const acceptedNorms = normalizations.filter(
        (normalization) => normalization.status === 'accepted'
      )

      try {
        const recalcLocale = currentLocale === 'en' || currentLocale === 'nl' ? currentLocale : 'nl'
        const latestFinancialOverrides = mapClarityFormToVenusStore(
          {
            ...collectedData,
            ...latestFormDataRef.current,
          },
          formStoreData
        )
        const requestSource = buildManualNormalizationRecalcSource({
          formStoreData,
          latestFinancialOverrides,
        })
        const request = buildManualCalculationRequest({
          formData: requestSource,
          normalizations,
          locale: recalcLocale,
          selectedMethod: preSelectedMethod ?? selectedMethod,
          identifiers: calculationRequestIdentifiers,
          synthesisSelection,
        })

        mergePreparerMultipleIntoRequest(request as unknown as Record<string, unknown>)
        const preparerState = usePreparerMultipleStore.getState()
        if (shouldBlockExtremePreparerMultiple(preparerState, resultMultiplesValuation)) {
          toast.error(translatePreparer('extremeWarning'))
          return
        }

        const calcResult = await valuationService.calculateValuation(request)
        if (!isStillRelevant()) return
        if (!calcResult) return

        setResult(calcResult)
        setDraftStatus('saved')
        setLastSaved(new Date())
        try {
          await reportService.saveReportAssets(
            idForApi,
            buildManualReportAssets({
              sessionData: requestSource as unknown as Record<string, unknown>,
              request: request as unknown as Record<string, unknown>,
              taxLatencyItems: useTaxLatencyStore.getState().items,
              valuationResult: calcResult,
              name: sessionName ?? undefined,
            })
          )
        } catch (saveError) {
          generalLogger.warn(
            '[ManualLayout] Failed to sync recalculated normalization report assets',
            {
              reportId: idForApi,
              error: saveError instanceof Error ? saveError.message : String(saveError),
            }
          )
        }
        if (!isStillRelevant()) return
        toast.success(translate('recalculatedWithNorms'), {
          description: translate('recalculatedWithNormsDesc', { count: acceptedNorms.length }),
        })
      } catch (error) {
        if (!isStillRelevant()) return
        generalLogger.warn('[ManualLayout] Normalization recalculation failed (non-blocking)', {
          error: error instanceof Error ? error.message : String(error),
        })
        toast.error(translate('normRecalcFailed'), {
          description: translate('normRecalcFailedDesc'),
        })
      }
    },
    [
      calculationRequestIdentifiers,
      collectedData,
      currentLocale,
      formStoreData,
      latestFormDataRef,
      preSelectedMethod,
      recalcLookupIdRef,
      recalcMountedRef,
      report,
      reportId,
      resolvedReportId,
      resultMultiplesValuation,
      selectedMethod,
      sessionName,
      setDraftStatus,
      setLastSaved,
      setResult,
      synthesisSelection,
      translate,
      translatePreparer,
    ]
  )

  const handleNormalizationsChange = useCallback(
    async (norms: NormalizationItem[]) => {
      const previousItems = useNormalizationStore.getState().items
      useNormalizationStore.getState().setItems(norms)

      if (
        buildAcceptedNormalizationSignature(previousItems) ===
        buildAcceptedNormalizationSignature(norms)
      ) {
        return
      }

      const idForApi = resolvedReportId || reportId
      if (!idForApi) return

      const allYears = buildManualNormalizationPersistenceYears({
        financialYears,
        previousItems,
        nextItems: norms,
      })

      try {
        await persistOrDeleteNormalizationsForYears(idForApi, allYears, originalEBITDAByYear, norms)
      } catch (error) {
        generalLogger.warn('[ManualLayout] Sync after normalization edit failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      await recalculateWithNormalizations(norms)
    },
    [
      financialYears,
      originalEBITDAByYear,
      reportId,
      resolvedReportId,
      recalculateWithNormalizations,
    ]
  )

  const recalculateWithNormalizationsRef = useRef(recalculateWithNormalizations)
  useEffect(() => {
    recalculateWithNormalizationsRef.current = recalculateWithNormalizations
  }, [recalculateWithNormalizations])

  const hasRecalculationReport = Boolean(report)
  useEffect(() => {
    if (!hasRecalculationReport) return
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let lastSignature = buildManualTaxLatencySignature(useTaxLatencyStore.getState().items)
    let lastMutationSeq = useTaxLatencyStore.getState()._mutationSeq
    let recalcGeneration = 0
    let inflightGeneration: number | null = null
    let pendingAfterInflight = false

    const runRecalc = async () => {
      recalcGeneration += 1
      const myGeneration = recalcGeneration
      inflightGeneration = myGeneration
      try {
        await recalculateWithNormalizationsRef.current(useNormalizationStore.getState().items)
      } finally {
        if (inflightGeneration === myGeneration) {
          inflightGeneration = null
          if (pendingAfterInflight) {
            pendingAfterInflight = false
            void runRecalc()
          }
        }
      }
    }

    const unsubscribe = useTaxLatencyStore.subscribe((state) => {
      if (state._mutationSeq === lastMutationSeq) return
      lastMutationSeq = state._mutationSeq

      const signature = buildManualTaxLatencySignature(state.items)
      const changed = signature !== lastSignature
      lastSignature = signature

      if (state._lastMutationSource !== 'user') {
        if (debounceTimer) {
          clearTimeout(debounceTimer)
          debounceTimer = null
        }
        pendingAfterInflight = false
        return
      }

      if (!changed) return

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (inflightGeneration !== null) {
          pendingAfterInflight = true
          return
        }
        void runRecalc()
      }, 400)
    })

    return () => {
      unsubscribe()
      if (debounceTimer) clearTimeout(debounceTimer)
      pendingAfterInflight = false
    }
  }, [hasRecalculationReport])

  return { handleNormalizationsChange, recalculateWithNormalizations }
}
