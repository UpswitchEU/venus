import { useCallback } from 'react'
import { toast } from 'sonner'
import { valuationService } from '../../../services'
import type { ValuationRequest, ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { persistNormalizationsBeforeCalculate } from '../../../utils/normalizationPersist'
import type { ManualSubmitRun } from './useManualSubmitRunGuard'

type ManualCalculationExecutionTranslator = (key: string) => string

export interface RunManualCalculationExecutionParams {
  idForApi?: string | null
  request: ValuationRequest
  retrySubmit: () => void
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
        const persistOk = await persistNormalizationsBeforeCalculate(idForApi, request)
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
          toast.error(translate('persistFailed'), {
            description: translate('persistFailedDesc'),
            action: {
              label: translate('retry'),
              onClick: retrySubmit,
            },
          })
          return { aborted: true, calculationDurationMs: 0, valuationResult: null }
        }
      }

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
      const valuationResult = await valuationService.calculateValuation(request)
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
