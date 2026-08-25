'use client'

import type { ValuationReportData } from '../../../components/calculator'
import {
  isVenturePathMethodKey,
  type MethodKey,
} from '../../../lib/methods'
import type { ValuationSession } from '../../../types/valuation'
import { useRestorationGate } from '../hooks/useRestorationGate'
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
  preSelectedMethod,
  report,
  reportId,
  resolvedReportId,
  restorationComplete,
  selectedMethod,
  session,
}: UseManualLayoutPreviewStateParams) {
  const effectiveAssistantMethod = preSelectedMethod ?? selectedMethod
  const isStartupAssistantRoute = isVenturePathMethodKey(effectiveAssistantMethod)

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
  }
}
