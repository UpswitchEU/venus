'use client'

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ValuationReportData } from '@/components/calculator'
import {
  evaluateSynthesisBlend,
  hydrateSynthesisValuationResultsMap,
  type SynthesisEvaluation,
} from '@/lib/synthesis/synthesisEngine'
import type { SynthesisWeightSelection } from '@/lib/synthesis/synthesisWeights'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import type { ValuationMethodResult, ValuationResponse } from '@/types/valuation'
import { deriveNavPricesForVersionNav } from '../components/manualReportPresentation'

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
        confidence?: 'high' | 'medium' | 'low'
        currency?: string | null
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
    const prices = deriveNavPricesForVersionNav(result, selectedMethod)
    if (!prices?.priceRange || prices.askPrice == null) return undefined
    return {
      priceRange: prices.priceRange,
      askPrice: prices.askPrice,
      confidence: report.confidenceLevel,
      currency: report.currency,
    }
  }, [report, result, selectedMethod])

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
