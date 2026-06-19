'use client'

import { useMemo } from 'react'
import type { ValuationReportData } from '../../../components/calculator'
import {
  isVenturePathMethodKey,
  type MethodKey,
  methodKeyAcceptsPreparerMultipleOverride,
} from '../../../lib/methods'
import type { ValuationSession } from '../../../types/valuation'
import { useRestorationGate } from '../hooks/useRestorationGate'
import { buildManualLiveMultiplePreview } from '../utils/manualLiveMultiplePreview'
import { shouldRestoreExistingManualReport } from './manualLayoutDerivedState'

export interface UseManualLayoutPreviewStateParams {
  isGenerating: boolean
  preparerAppliedMedian: number | null
  preparerBenchmarkMedian: number | null
  preSelectedMethod: MethodKey | null | undefined
  report: ValuationReportData | null
  reportId?: string | null
  resolvedReportId?: string | null
  restorationComplete: boolean
  result: unknown
  selectedMethod: MethodKey | null | undefined
  session: ValuationSession | null
}

export function useManualLayoutPreviewState({
  isGenerating,
  preparerAppliedMedian,
  preparerBenchmarkMedian,
  preSelectedMethod,
  report,
  reportId,
  resolvedReportId,
  restorationComplete,
  result,
  selectedMethod,
  session,
}: UseManualLayoutPreviewStateParams) {
  const effectiveAssistantMethod = preSelectedMethod ?? selectedMethod
  const isStartupAssistantRoute = isVenturePathMethodKey(effectiveAssistantMethod)

  const liveMultipleReportPreview = useMemo(
    () =>
      buildManualLiveMultiplePreview({
        result,
        report,
        methodAcceptsOverride: methodKeyAcceptsPreparerMultipleOverride(selectedMethod),
        appliedMedian: preparerAppliedMedian,
        benchmarkMedian: preparerBenchmarkMedian,
      }),
    [preparerAppliedMedian, preparerBenchmarkMedian, report, result, selectedMethod]
  )

  const isRestoringExistingReport = shouldRestoreExistingManualReport({
    isGenerating,
    report,
    reportId,
    resolvedReportId,
    session,
    sessionReportId: session?.reportId,
  })
  const { effectiveIsRestoringExistingReport } = useRestorationGate({
    isRestoringExistingReport,
    restorationComplete,
  })

  return {
    effectiveAssistantMethod,
    effectiveIsRestoringExistingReport,
    isStartupAssistantRoute,
    liveMultipleReportPreview,
  }
}
