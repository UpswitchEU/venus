'use client'

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ValuationReportData } from '@/components/calculator'
import {
  bestBlendedValue,
  evaluateSynthesisBlend,
  type SynthesisEvaluation,
} from '@/lib/synthesis/synthesisEngine'
import type { SynthesisWeightSelection } from '@/lib/synthesis/synthesisWeights'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import type { ValuationMethodResult, ValuationResponse } from '@/types/valuation'
import { hydrateClientValuationResultsMap } from '@/utils/extractValuationResultsMap'

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
}: {
  result: ValuationResponse | null
  report: ValuationReportData | null
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

  const valuationResults = useMemo(() => hydrateClientValuationResultsMap(result) ?? null, [result])

  const navValuationSummary = useMemo(() => {
    if (!report) return undefined
    const primaryValue =
      bestBlendedValue(evaluation) ?? report.recommendedAskingPrice ?? report.valuation
    return {
      priceRange: {
        min: report.valuationLow ?? Math.round(report.valuation * 0.85),
        max: report.valuationHigh ?? Math.round(report.valuation * 1.15),
      },
      askPrice: primaryValue,
      confidence: 'high' as const,
    }
  }, [evaluation, report])

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
