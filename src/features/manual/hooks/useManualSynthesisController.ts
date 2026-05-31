'use client'

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ValuationReportData } from '@/components/calculator'
import {
  bestBlendedValue,
  evaluateSynthesisBlend,
  hydrateSynthesisValuationResultsMap,
  type SynthesisEvaluation,
} from '@/lib/synthesis/synthesisEngine'
import type { SynthesisWeightSelection } from '@/lib/synthesis/synthesisWeights'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import type { ValuationMethodResult, ValuationResponse } from '@/types/valuation'
import { resolveSynthesisAwarePresentation } from '../components/manualReportPresentation'
import { resultHasWeightedSynthesisSignal } from '../utils/weightedSynthesisSignals'

export interface ManualSynthesisController {
  preSelectedMethods: string[]
  userWeights: Record<string, number>
  userWeightJustification: string
  selection: SynthesisWeightSelection
  setUserWeights: (weights: Record<string, number>) => void
  setUserWeightJustification: (justification: string) => void
  evaluation: SynthesisEvaluation
  valuationResults: Record<string, ValuationMethodResult> | null
  navValuationSummary:
    | {
        priceRange: { min: number; max: number }
        askPrice: number
        confidence: 'high'
      }
    | undefined
}

export function useManualSynthesisController({
  result,
  report,
  selectedMethod,
}: {
  result: ValuationResponse | null
  report: ValuationReportData | null
  selectedMethod: string
}): ManualSynthesisController {
  const {
    preSelectedMethods,
    userWeights,
    userWeightJustification,
    setUserWeights,
    setUserWeightJustification,
  } = useManualResultsStore(
    useShallow((s) => ({
      preSelectedMethods: s.preSelectedMethods,
      userWeights: s.userWeights,
      userWeightJustification: s.userWeightJustification,
      setUserWeights: s.setUserWeights,
      setUserWeightJustification: s.setUserWeightJustification,
    }))
  )

  const evaluation = useMemo(
    () => evaluateSynthesisBlend({ result, preSelectedMethods, userWeights }),
    [result, preSelectedMethods, userWeights]
  )

  const selection = useMemo(
    () => ({
      preSelectedMethods,
      userWeights,
      userWeightJustification,
    }),
    [preSelectedMethods, userWeights, userWeightJustification]
  )

  const valuationResults = useMemo(
    () => hydrateSynthesisValuationResultsMap(result) ?? null,
    [result]
  )

  const navValuationSummary = useMemo(() => {
    if (!report || !result) return undefined
    const blend = bestBlendedValue(evaluation)
    const presentation = resolveSynthesisAwarePresentation(result, selectedMethod, {
      preSelectedMethods,
      userWeights,
    })
    const hasSynthesis = resultHasWeightedSynthesisSignal(
      result as unknown as Record<string, unknown>
    )
    const primaryValue =
      hasSynthesis || blend != null
        ? (blend ?? presentation.valuation)
        : (report.recommendedAskingPrice ?? presentation.valuation)
    return {
      priceRange: {
        min: presentation.valuationLow ?? report.valuationLow ?? Math.round(primaryValue * 0.85),
        max: presentation.valuationHigh ?? report.valuationHigh ?? Math.round(primaryValue * 1.15),
      },
      askPrice: primaryValue,
      confidence: 'high' as const,
    }
  }, [evaluation, preSelectedMethods, report, result, selectedMethod, userWeights])

  return {
    preSelectedMethods,
    userWeights,
    userWeightJustification,
    selection,
    setUserWeights,
    setUserWeightJustification,
    evaluation,
    valuationResults,
    navValuationSummary,
  }
}
