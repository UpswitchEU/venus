'use client'

import { type Dispatch, type SetStateAction, useEffect } from 'react'
import type { ValuationReportData } from '@/components/calculator'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import type { ValuationResponse } from '@/types/valuation'
import {
  deriveNavPricesForVersionNav,
  resolveSynthesisAwarePresentation,
} from '../components/manualReportPresentation'

export interface UseSynthesisReportHeadlineSyncParams {
  result: ValuationResponse | null | undefined
  report: ValuationReportData | null
  selectedMethod: string
  setReport: Dispatch<SetStateAction<ValuationReportData | null>>
}

/**
 * Keeps `report.valuation`, range and asking price aligned with the saved engine result
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
    const nextAsk = deriveNavPricesForVersionNav(result, selectedMethod)?.askPrice

    if (
      report.valuation === nextValuation &&
      (report.valueBasis ?? null) === (presentation.valueBasis ?? null) &&
      report.valuationLow === nextLow &&
      report.valuationHigh === nextHigh &&
      report.recommendedAskingPrice === nextAsk
    ) {
      return
    }

    setReport((prev) =>
      prev
        ? {
            ...prev,
            valuation: nextValuation,
            valueBasis: presentation.valueBasis,
            valuationLow: nextLow,
            valuationHigh: nextHigh,
            recommendedAskingPrice: nextAsk,
          }
        : prev
    )
  }, [report, result, selectedMethod, setReport])
}
