import { useCallback } from 'react'
import { toast } from 'sonner'
import { valuationService } from '../../../services'
import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import { clearReportRecovery, deferReportRecovery } from '../../../store/reportRecoveryStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ValuationRequest, ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { persistNormalizationsBeforeCalculate } from '../../../utils/normalizationPersist'
import {
  persistenceFailure,
  requirePersistenceAcknowledgement,
} from '../../../utils/persistenceOutcome'
import type { ManualSubmitRun } from './useManualSubmitRunGuard'

type ManualCalculationExecutionTranslator = (key: string) => string

export interface RunManualCalculationExecutionParams {
  idForApi?: string | null
  request: ValuationRequest
  retrySubmit: () => Promise<unknown> | void
  submitRun: ManualSubmitRun
}

export interface RunManualCalculationExecutionResult {
  aborted: boolean
  calculationDurationMs: number
  valuationResult: ValuationResponse | null
}

export interface UseManualCalculationExecutionParams {
  translate: ManualCalculationExecutionTranslator
}

export interface UseManualCalculationExecutionResult {
  runManualCalculationExecution: (
    params: RunManualCalculationExecutionParams
  ) => Promise<RunManualCalculationExecutionResult>
}

export function useManualCalculationExecution({
  translate,
}: UseManualCalculationExecutionParams): UseManualCalculationExecutionResult {
  const runManualCalculationExecution = useCallback(
    async ({
      idForApi,
      request,
      retrySubmit,
      submitRun,
    }: RunManualCalculationExecutionParams): Promise<RunManualCalculationExecutionResult> => {
      if (idForApi) {
        let persistOk = false
        try {
          const session = useSessionStore.getState()
          await session.updateSessionData({
            ...useManualFormStore.getState().formData,
            _normalizations: useNormalizationStore.getState().items,
          })
          requirePersistenceAcknowledgement(await useSessionStore.getState().saveSession('user'))
          persistOk = await persistNormalizationsBeforeCalculate(idForApi, request)
        } catch {
          /* The report-level recovery retains the exact failed prerequisite. */
        }
        if (!submitRun.isStillTarget()) {
          submitRun.endLoading()
          generalLogger.info(
            '[ManualValuationWorkspace] Dropping stale manual calculation before submit',
            {
              ...submitRun.staleContext(),
            }
          )
          return { aborted: true, calculationDurationMs: 0, valuationResult: null }
        }
        if (!persistOk) {
          submitRun.endLoading()
          generalLogger.warn(
            '[ManualValuationWorkspace] Pre-calculate normalization persist failed'
          )
          const failure =
            useSessionStore.getState().saveFailure ??
            useNormalizationStore.getState().pendingMutations.find((p) => p.failure)?.failure
          deferReportRecovery(
            idForApi,
            'inputs',
            failure ?? new Error('Save not acknowledged'),
            async () => retrySubmit()
          )
          return { aborted: true, calculationDurationMs: 0, valuationResult: null }
        }
      }

      if (idForApi) clearReportRecovery(idForApi)
      const calcStartTime = Date.now()
      // Include business_type_id + methodology in the diagnostic so a 422/500
      // post-mortem can tell whether the FE actually sent enough for the
      // Titan/python multiples preflight to attach a Delphi benchmark
      // contract. Without these we can't distinguish a missing-on-FE bug
      // from a Titan enrichment lookup miss.
      generalLogger.info('[ManualValuationWorkspace] Calling valuationService.calculateValuation', {
        companyName: request.company_name,
        industry: request.industry,
        businessTypeId: request.business_type_id ?? null,
        methodology: (request as { methodology?: string }).methodology ?? null,
        selectedMethod: (request as { selected_method?: string }).selected_method ?? null,
        useMultiples: (request as { use_multiples?: boolean }).use_multiples ?? null,
      })
      let valuationResult: ValuationResponse
      try {
        valuationResult = await valuationService.calculateValuation(request)
      } catch (error) {
        const failure = persistenceFailure(error)
        // These contracts are emitted by authorization before calculation starts.
        // Ambiguous transport failures are never automatically replayed: calculate
        // remains a non-idempotent operation.
        if (
          idForApi &&
          submitRun.isStillTarget() &&
          (failure.code === 'ADVISORY_VERIFICATION_UNAVAILABLE' ||
            failure.code === 'ADVISORY_SUBSCRIPTION_REQUIRED')
        ) {
          useSessionStore.setState({ saveFailure: failure })
          deferReportRecovery(idForApi, 'inputs', error, async () => retrySubmit())
          submitRun.endLoading()
          return {
            aborted: true,
            calculationDurationMs: Date.now() - calcStartTime,
            valuationResult: null,
          }
        }
        throw error
      }
      const calculationDurationMs = Date.now() - calcStartTime

      if (!submitRun.isStillTarget()) {
        submitRun.endLoading()
        generalLogger.info('[ManualValuationWorkspace] Dropping stale manual calculation result', {
          ...submitRun.staleContext(),
        })
        return { aborted: true, calculationDurationMs, valuationResult: null }
      }

      if (!valuationResult) {
        submitRun.endLoading()
        toast.error(translate('calculationFailed'), {
          description: translate('calculationFailedNoResult'),
          action: {
            label: translate('retry'),
            onClick: retrySubmit,
          },
        })
        return { aborted: true, calculationDurationMs, valuationResult: null }
      }

      return { aborted: false, calculationDurationMs, valuationResult }
    },
    [translate]
  )

  return { runManualCalculationExecution }
}
