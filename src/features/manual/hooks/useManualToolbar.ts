/**
 * Manual Toolbar Hook
 *
 * Single Responsibility: Toolbar handlers for manual layout.
 *
 * @module features/manual/hooks/useManualToolbar
 */

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { trackPDFDownload } from '@/lib/analytics'
import { usePdfGeneration } from '../../../hooks/usePdfGeneration'
import { useValuationToolbarRefresh } from '../../../hooks/valuationToolbar'
import { RefreshService } from '../../../services/toolbar/refreshService'
import UrlGeneratorService from '../../../services/urlGenerator'
import { useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import { APIError } from '../../../types/errors'
import { isPdfTransientUpstreamStatus } from '../../../utils/pdfTransientUpstream'
import type { ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { generateReportId } from '../../../utils/reportIdGenerator'
import { buildManualPdfFilename } from '../utils/manualPdfExport'

/**
 * Manual Toolbar Hook Return Type
 */
export interface UseManualToolbarReturn {
  /** Handle refresh action */
  handleRefresh: () => void
  /** Handle download action */
  handleDownload: () => Promise<void>
  /** Whether download is in progress */
  isDownloading: boolean
}

/**
 * Manual Toolbar Hook Options
 */
interface UseManualToolbarOptions {
  /** Current valuation result */
  result: ValuationResponse | null
}

/**
 * Manual Toolbar Hook
 *
 * Provides toolbar handlers for manual layout.
 */
export const useManualToolbar = ({ result }: UseManualToolbarOptions): UseManualToolbarReturn => {
  const { handleRefresh: handleHookRefresh } = useValuationToolbarRefresh()
  const tToast = useTranslations('toast')
  // Read from unified session store
  const sessionReportId = useSessionStore((state) => state.session?.reportId)
  const { downloadPdf } = usePdfGeneration(sessionReportId ?? null)
  const [isDownloading, setIsDownloading] = useState(false)
  const downloadInFlightRef = useRef(false)
  const downloadAbortRef = useRef<AbortController | null>(null)
  const downloadRunIdRef = useRef(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionReportId intentionally cancels in-flight downloads on report navigation.
  useEffect(() => {
    downloadRunIdRef.current++
    downloadInFlightRef.current = false
    downloadAbortRef.current?.abort()
    downloadAbortRef.current = null
    setIsDownloading(false)
    return () => {
      downloadRunIdRef.current++
      downloadInFlightRef.current = false
      downloadAbortRef.current?.abort()
      downloadAbortRef.current = null
    }
  }, [sessionReportId])

  const handleRefresh = useCallback(() => {
    const newReportId = generateReportId()
    RefreshService.navigateTo(UrlGeneratorService.reportById(newReportId))
    handleHookRefresh()
  }, [handleHookRefresh])

  const handleDownload = useCallback(async () => {
    if (downloadInFlightRef.current) return
    const currentResult = result || useManualResultsStore.getState().result
    const reportId = sessionReportId // Use stable reportId from selector

    if (!currentResult || !currentResult.html_report) {
      generalLogger.warn('Cannot download PDF: No valuation result or HTML report available', {
        hasResult: !!currentResult,
        hasHtmlReport: !!currentResult?.html_report,
      })
      return
    }

    if (!reportId) {
      generalLogger.error('Cannot download PDF: Report ID not available', {
        reportId,
      })
      return
    }

    downloadInFlightRef.current = true
    const runId = ++downloadRunIdRef.current
    const isCurrentRun = () => downloadRunIdRef.current === runId && sessionReportId === reportId
    const abortController = new AbortController()
    downloadAbortRef.current = abortController
    setIsDownloading(true)
    try {
      generalLogger.info('Initiating backend PDF download', {
        reportId,
        valuationId: currentResult.valuation_id,
        companyName: currentResult.company_name,
      })

      const filename = buildManualPdfFilename({
        companyName: currentResult.company_name,
        defaultFilename: 'valuation',
        pdfSuffix: 'report',
        timestamp: Date.now(),
      })

      await downloadPdf(undefined, filename, abortController.signal, reportId)
      if (!isCurrentRun()) return

      trackPDFDownload()
      generalLogger.info('PDF download completed successfully', {
        reportId,
        filename,
      })
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 402) {
        if (isCurrentRun()) {
          toast.error(tToast('pdfDownloadPlanBlocked'), {
            description: error.message || tToast('pdfDownloadPlanBlockedDesc'),
          })
          generalLogger.warn('PDF download blocked by plan', {
            reportId,
            valuationId: currentResult.valuation_id,
          })
        }
        return
      }
      if (error instanceof APIError && isPdfTransientUpstreamStatus(error.statusCode)) {
        if (isCurrentRun()) toast.warning(tToast('pdfPollDegradedHint'))
        return
      }
      if (error instanceof Error && error.name === 'AbortError') return
      if (!isCurrentRun()) return
      // BANK-GRADE: Specific error handling - PDF download failure
      if (error instanceof Error) {
        generalLogger.error('PDF download failed', {
          error: error.message,
          stack: error.stack,
          reportId,
          valuationId: currentResult.valuation_id,
        })
        toast.error(tToast('pdfExportFailed'), {
          description: error.message || tToast('pdfExportFailedDesc'),
        })
      } else {
        generalLogger.error('PDF download failed', {
          error: String(error),
          reportId,
          valuationId: currentResult.valuation_id,
        })
        toast.error(tToast('pdfExportFailed'), {
          description: tToast('pdfExportFailedDesc'),
        })
      }
    } finally {
      if (isCurrentRun()) {
        downloadInFlightRef.current = false
        setIsDownloading(false)
        if (downloadAbortRef.current === abortController) {
          downloadAbortRef.current = null
        }
      }
    }
  }, [downloadPdf, result, sessionReportId, tToast]) // ⚠️ Use stable reportId, not entire session

  return {
    handleRefresh,
    handleDownload,
    isDownloading,
  }
}
