'use client'

import { type Dispatch, type SetStateAction, useEffect } from 'react'
import type { ValuationReportData } from '@/components/calculator'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import type { ValuationResponse } from '@/types/valuation'
import {
  resolveSynthesisAwarePresentation,
  shouldAlignRecommendedAskingWithSynthesis,
} from '../components/manualReportPresentation'

export interface UseSynthesisReportHeadlineSyncParams {
  result: ValuationResponse | null | undefined
  report: ValuationReportData | null
  selectedMethod: string
  setReport: Dispatch<SetStateAction<ValuationReportData | null>>
}

/**
 * Keeps `report.valuation` / range aligned with live Waarderingssynthese weights
 * without re-running the full result→report bridge (PDF gen, panel flip, etc.).
 */
export function useSynthesisReportHeadlineSync({
  result,
  report,
  selectedMethod,
  setReport,
}: UseSynthesisReportHeadlineSyncParams): void {
  useEffect(() => {
    if (!result || !report) return

    const { preSelectedMethods, userWeights } = useManualResultsStore.getState()
    const presentation = resolveSynthesisAwarePresentation(result, selectedMethod, {
      preSelectedMethods,
      userWeights,
    })
    const nextValuation = presentation.valuation
    const nextLow = presentation.valuationLow
    const nextHigh = presentation.valuationHigh
    const alignAsk = shouldAlignRecommendedAskingWithSynthesis(result, {
      preSelectedMethods,
      userWeights,
    })
    const hasPositiveNextValuation = Number.isFinite(nextValuation) && nextValuation > 0
    const reportAsk =
      report.recommendedAskingPrice == null ? null : Number(report.recommendedAskingPrice)
    const reportAskIsBroken =
      report.recommendedAskingPrice != null &&
      (!Number.isFinite(reportAsk) || (reportAsk != null && reportAsk <= 0))
    const shouldWriteAsk = alignAsk || (reportAskIsBroken && hasPositiveNextValuation)
    const nextAsk = shouldWriteAsk
      ? hasPositiveNextValuation
        ? nextValuation
        : undefined
      : report.recommendedAskingPrice

    if (
      report.valuation === nextValuation &&
      report.valuationLow === nextLow &&
      report.valuationHigh === nextHigh &&
      (!shouldWriteAsk || report.recommendedAskingPrice === nextAsk)
    ) {
      return
    }

    setReport((prev) =>
      prev
        ? {
            ...prev,
            valuation: nextValuation,
            valuationLow: nextLow,
            valuationHigh: nextHigh,
            ...(shouldWriteAsk ? { recommendedAskingPrice: nextAsk } : {}),
          }
        : prev
    )
  }, [report, result, selectedMethod, setReport])
}
