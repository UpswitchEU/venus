import type { Dispatch, SetStateAction } from 'react'
import { useCallback } from 'react'
import type { ValuationReportData } from '@/components/calculator'
import { type UsePdfGenerationReturn, usePdfGeneration } from '@/hooks/usePdfGeneration'
import { backendAPI } from '@/services/backendApi'
import type { ValuationResponse, ValuationSession } from '@/types/valuation'
import {
  type UseManualReportHtmlRecoveryResult,
  useManualReportHtmlRecovery,
} from './useManualReportHtmlRecovery'
import {
  type UseManualReportMethodHydrationResult,
  useManualReportMethodHydration,
} from './useManualReportMethodHydration'
import {
  type GetReportFn,
  type PdfLifecycleTranslator,
  type UsePdfStalenessLifecycleResult,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle'

export interface UseManualReportReadinessControllerParams {
  reportId: string
  resolvedReportId?: string | null
  reportHydrationLookupId?: string | null
  pdfStalePollLookupId?: string | null
  firmCountryCode?: string | null
  report: ValuationReportData | null
  result: ValuationResponse | null | undefined
  session: ValuationSession | null | undefined
  standaloneHtmlReport?: string | null
  restorationComplete: boolean
  isCalculating: boolean
  isGenerating: boolean
  canDownloadPdf: boolean
  setResult: (result: ValuationResponse | null) => void
  setReport: Dispatch<SetStateAction<ValuationReportData | null>>
  openStarterPaywall: (reason: 'pdf_download') => void
  showRetryFailureToast: (title: string, options: { description: string }) => void
  translateToast: PdfLifecycleTranslator
}

export interface UseManualReportReadinessControllerResult
  extends UseManualReportMethodHydrationResult,
    UseManualReportHtmlRecoveryResult,
    Omit<UsePdfStalenessLifecycleResult, 'retry'> {
  pdfGenerationState: UsePdfGenerationReturn['state']
  generatePdf: UsePdfGenerationReturn['generatePdf']
  downloadPdf: UsePdfGenerationReturn['downloadPdf']
  isPdfReady: UsePdfGenerationReturn['isReady']
  isPdfGenerating: UsePdfGenerationReturn['isGenerating']
  handleRetryPdfStalled: UsePdfStalenessLifecycleResult['retry']
}

export function useManualReportReadinessController({
  reportId,
  resolvedReportId,
  reportHydrationLookupId,
  pdfStalePollLookupId,
  firmCountryCode,
  report,
  result,
  session,
  standaloneHtmlReport,
  restorationComplete,
  isCalculating,
  isGenerating,
  canDownloadPdf,
  setResult,
  setReport,
  openStarterPaywall,
  showRetryFailureToast,
  translateToast,
}: UseManualReportReadinessControllerParams): UseManualReportReadinessControllerResult {
  const {
    state: pdfGenerationState,
    generatePdf,
    downloadPdf,
    isReady: isPdfReady,
    isGenerating: isPdfGenerating,
  } = usePdfGeneration(resolvedReportId ?? reportId)

  const {
    isHydratingEditModalData,
    reportMethodHydrationError,
    retryReportMethodHydration,
    showFiscalReferenceForOmni,
  } = useManualReportMethodHydration({
    firmCountryCode,
    reportHydrationLookupId,
    restorationComplete,
    setResult,
  })

  const { isRecoveringReportHtml } = useManualReportHtmlRecovery({
    reportId,
    session,
    result,
    standaloneHtmlReport,
    restorationComplete,
    isCalculating,
    isGenerating,
  })

  const getReport = useCallback<GetReportFn>(
    (lookupId, options) => backendAPI.getReport(lookupId, options),
    []
  )

  const {
    pdfStale,
    pdfWaitTimedOut,
    pdfPollErrorCount,
    pdfPollTransientCount,
    isPdfRetrying,
    retry: handleRetryPdfStalled,
  } = usePdfStalenessLifecycle({
    report,
    isPdfReady,
    isPdfGenerating,
    pdfGenerationState,
    persistedReportLookupId: pdfStalePollLookupId ?? null,
    canDownloadPdf,
    generatePdf,
    getReport,
    setResult,
    setReport,
    openStarterPaywall,
    showRetryFailureToast,
    translate: translateToast,
  })

  return {
    pdfGenerationState,
    generatePdf,
    downloadPdf,
    isPdfReady,
    isPdfGenerating,
    isHydratingEditModalData,
    reportMethodHydrationError,
    retryReportMethodHydration,
    showFiscalReferenceForOmni,
    isRecoveringReportHtml,
    pdfStale,
    pdfWaitTimedOut,
    pdfPollErrorCount,
    pdfPollTransientCount,
    isPdfRetrying,
    handleRetryPdfStalled,
  }
}
