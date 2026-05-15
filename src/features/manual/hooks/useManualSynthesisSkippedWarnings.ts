import { type MutableRefObject, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { METHOD_LABEL_KEYS } from '../../../constants/methodLabels'
import {
  evaluateSynthesisBlend,
  type SynthesisEvaluation,
  shouldWarnSynthesisSkipped,
} from '../../../lib/synthesis/synthesisEngine'
import { useManualResultsStore } from '../../../store/manual'
import type { ValuationResponse } from '../../../types/valuation'
import { valuationResultRunKey } from '../../../utils/valuationResultRunKey'

type ManualSynthesisToastTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string

type ManualSynthesisMethodTranslator = (key: 'dcf') => string

export interface UseManualSynthesisSkippedWarningsParams {
  lastSynthesisBlendSkippedRunKeyRef: MutableRefObject<string | null>
  result: ValuationResponse | null
  synthesisEvaluation: SynthesisEvaluation
  translate: ManualSynthesisToastTranslator
  translateMethodSelector: ManualSynthesisMethodTranslator
}

export interface UseManualSynthesisSkippedWarningsResult {
  warnIfSubmitSynthesisSkipped: (valuationResult: ValuationResponse) => void
}

export function useManualSynthesisSkippedWarnings({
  lastSynthesisBlendSkippedRunKeyRef,
  result,
  synthesisEvaluation,
  translate,
  translateMethodSelector,
}: UseManualSynthesisSkippedWarningsParams): UseManualSynthesisSkippedWarningsResult {
  useEffect(() => {
    if (!result) return
    if (!shouldWarnSynthesisSkipped(synthesisEvaluation)) return

    const runKey = valuationResultRunKey(result)
    if (runKey === lastSynthesisBlendSkippedRunKeyRef.current) return
    lastSynthesisBlendSkippedRunKeyRef.current = runKey

    toast.warning(translate('synthesisBlendSkippedTitle'), {
      description: translate('synthesisBlendSkippedDesc'),
    })
  }, [lastSynthesisBlendSkippedRunKeyRef, result, synthesisEvaluation, translate])

  const warnIfSubmitSynthesisSkipped = useCallback(
    (valuationResult: ValuationResponse) => {
      const storeForBlend = useManualResultsStore.getState()
      const submitBlend = evaluateSynthesisBlend({
        result: valuationResult,
        preSelectedMethods: storeForBlend.preSelectedMethods,
        userWeights: storeForBlend.userWeights,
      })
      const blendRunKey = valuationResultRunKey(valuationResult)
      if (
        submitBlend.client.kind !== 'blocked' ||
        submitBlend.serverBlended != null ||
        !blendRunKey ||
        lastSynthesisBlendSkippedRunKeyRef.current === blendRunKey
      ) {
        return
      }

      lastSynthesisBlendSkippedRunKeyRef.current = blendRunKey
      const blockerKey = submitBlend.client.blockerMethod
      const labelTail = METHOD_LABEL_KEYS[blockerKey]?.replace('manualInput.methodSelector.', '')
      const methodLabel = labelTail
        ? translateMethodSelector(labelTail as 'dcf')
        : blockerKey.replace(/_/g, ' ')

      toast.warning(translate('synthesisBlendSkippedTitle'), {
        description: translate('synthesisBlendSkippedDesc', {
          method: methodLabel,
          reason:
            submitBlend.client.blockerReason ?? translate('synthesisBlendSkippedReasonFallback'),
        }),
      })
    },
    [lastSynthesisBlendSkippedRunKeyRef, translate, translateMethodSelector]
  )

  return { warnIfSubmitSynthesisSkipped }
}
