/**
 * Valuation Toolbar Download Hook
 *
 * Owns the toolbar-specific PDF download lifecycle around the shared
 * server-side PDF generation hook.
 *
 * @module hooks/valuationToolbar/useValuationToolbarDownload
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { APIError } from '../../types/errors'
import { generalLogger } from '../../utils/logger'
import { isPdfTransientUpstreamStatus } from '../../utils/pdfTransientUpstream'
import { type PdfGenerationState, usePdfGeneration } from '../usePdfGeneration'

type ValuationToolbarDownloadToastKey =
  | 'pdfDownloadPlanBlocked'
  | 'pdfDownloadPlanBlockedDesc'
  | 'pdfExportFailed'
  | 'pdfExportFailedDesc'
  | 'pdfPollDegradedHint'

export interface UseValuationToolbarDownloadOptions {
  reportId: string | null
  onDownload?: () => void
  translateToast: (key: ValuationToolbarDownloadToastKey) => string
}

export interface UseValuationToolbarDownloadReturn {
  pdfState: PdfGenerationState
  isPdfReady: boolean
  isPdfGenerating: boolean
  isPdfDownloading: boolean
  isDownloading: boolean
  handleDownload: () => Promise<void>
}

/**
 * Hook for managing report-scoped PDF downloads in ValuationToolbar.
 */
export const useValuationToolbarDownload = ({
  reportId,
  onDownload,
  translateToast,
}: UseValuationToolbarDownloadOptions): UseValuationToolbarDownloadReturn => {
  const {
    state: pdfState,
    downloadPdf,
    isReady: isPdfReady,
    isGenerating: isPdfGenerating,
  } = usePdfGeneration(reportId)
  const [isPdfDownloading, setIsPdfDownloading] = useState(false)
  const pdfDownloadInFlightRef = useRef(false)
  const pdfDownloadAbortRef = useRef<AbortController | null>(null)
  const pdfDownloadRunIdRef = useRef(0)

  useEffect(() => {
    void reportId
    pdfDownloadRunIdRef.current++
    pdfDownloadInFlightRef.current = false
    pdfDownloadAbortRef.current?.abort()
    pdfDownloadAbortRef.current = null
    setIsPdfDownloading(false)

    return () => {
      pdfDownloadRunIdRef.current++
      pdfDownloadInFlightRef.current = false
      pdfDownloadAbortRef.current?.abort()
      pdfDownloadAbortRef.current = null
    }
  }, [reportId])

  const handleDownload = useCallback(async () => {
    if (onDownload) {
      onDownload()
      return
    }

    if (pdfDownloadInFlightRef.current) return

    pdfDownloadInFlightRef.current = true
    const runId = ++pdfDownloadRunIdRef.current
    const activeReportId = reportId
    const isCurrentRun = () => pdfDownloadRunIdRef.current === runId && reportId === activeReportId
    const abortController = new AbortController()
    pdfDownloadAbortRef.current = abortController
    setIsPdfDownloading(true)

    try {
      await downloadPdf(undefined, undefined, abortController.signal)
      if (!isCurrentRun()) return
    } catch (err) {
      if (err instanceof APIError && err.statusCode === 402) {
        if (isCurrentRun()) {
          toast.error(translateToast('pdfDownloadPlanBlocked'), {
            description: translateToast('pdfDownloadPlanBlockedDesc'),
          })
        }
        return
      }

      if (err instanceof APIError && isPdfTransientUpstreamStatus(err.statusCode)) {
        if (isCurrentRun()) {
          toast.warning(translateToast('pdfPollDegradedHint'))
        }
        return
      }

      if (err instanceof Error && err.name === 'AbortError') return
      if (!isCurrentRun()) return

      generalLogger.error('[ValuationToolbar] PDF download failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      toast.error(translateToast('pdfExportFailed'), {
        description: err instanceof Error ? err.message : translateToast('pdfExportFailedDesc'),
      })
    } finally {
      if (isCurrentRun()) {
        pdfDownloadInFlightRef.current = false
        setIsPdfDownloading(false)
        if (pdfDownloadAbortRef.current === abortController) {
          pdfDownloadAbortRef.current = null
        }
      }
    }
  }, [downloadPdf, onDownload, reportId, translateToast])

  return {
    pdfState,
    isPdfReady,
    isPdfGenerating,
    isPdfDownloading,
    isDownloading: isPdfGenerating || isPdfDownloading,
    handleDownload,
  }
}
