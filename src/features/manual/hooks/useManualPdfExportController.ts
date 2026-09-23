import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { DownloadHistoryItem } from '../../../components/calculator'
import { type PdfRefusal, PdfRequestRefusedError } from '../../../hooks/pdfGenerationModel'
import { trackPDFDownload } from '../../../lib/analytics'
import { APIError } from '../../../types/errors'
import { generalLogger } from '../../../utils/logger'
import { isPdfTransientUpstreamStatus } from '../../../utils/pdfTransientUpstream'
import {
  buildManualDownloadHistoryItem,
  buildManualPdfFilename,
  isValidManualPdfExportId,
} from '../utils/manualPdfExport'

interface ManualPdfExportReport {
  companyName?: string | null
}

export interface UseManualPdfExportControllerParams {
  report?: ManualPdfExportReport | null
  reportId: string
  resolvedReportId?: string | null
  canDownloadPdf: boolean
  pdfStale: boolean
  /**
   * When true, a background PDF job is running and export waits for it. A stale PDF with no
   * job running is exported through the download route, which regenerates it on demand.
   */
  isPdfGenerating?: boolean
  downloadPdf: (
    url?: string,
    filename?: string,
    signal?: AbortSignal,
    reportIdOverride?: string | null
  ) => Promise<void>
  openPdfPaywall: () => void
  defaultFilename: string
  pdfSuffix: string
  /** Shown when Titan/BFF returns transient 5xx during download (pooler blips). */
  transientDownloadHint: string
  exportFailedTitle: string
  exportFailedDescription: string
  generatingTitle: string
  downloadedTitle: string
  /** The adviser-facing reason when the server refuses to produce this report's PDF. */
  describeRefusal: (refusal: PdfRefusal) => string
}

export interface UseManualPdfExportControllerResult {
  isExporting: boolean
  downloadHistory: DownloadHistoryItem[]
  handleExport: () => Promise<void>
}

const PDF_EXPORT_TOAST_ID = 'pdf-gen'

export function useManualPdfExportController({
  report,
  reportId,
  resolvedReportId,
  canDownloadPdf,
  pdfStale,
  isPdfGenerating = false,
  downloadPdf,
  openPdfPaywall,
  defaultFilename,
  pdfSuffix,
  transientDownloadHint,
  exportFailedTitle,
  exportFailedDescription,
  generatingTitle,
  downloadedTitle,
  describeRefusal,
}: UseManualPdfExportControllerParams): UseManualPdfExportControllerResult {
  const [isExporting, setIsExporting] = useState(false)
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryItem[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const exportRunIdRef = useRef(0)
  const isExportingRef = useRef(false)
  const currentPdfReportId = resolvedReportId ?? reportId
  const previousPdfReportIdRef = useRef(currentPdfReportId)

  useEffect(() => {
    if (previousPdfReportIdRef.current === currentPdfReportId) return
    previousPdfReportIdRef.current = currentPdfReportId
    exportRunIdRef.current++
    isExportingRef.current = false
    abortRef.current?.abort()
    abortRef.current = null
    toast.dismiss(PDF_EXPORT_TOAST_ID)
    setIsExporting(false)
  }, [currentPdfReportId])

  useEffect(() => {
    return () => {
      exportRunIdRef.current++
      isExportingRef.current = false
      abortRef.current?.abort()
      toast.dismiss(PDF_EXPORT_TOAST_ID)
    }
  }, [])

  const handleExport = useCallback(async () => {
    if (isExportingRef.current) return
    if (!report) return
    if (!canDownloadPdf) {
      openPdfPaywall()
      return
    }
    if (pdfStale && isPdfGenerating) {
      toast.info(generatingTitle, { id: PDF_EXPORT_TOAST_ID })
      return
    }

    const filename = buildManualPdfFilename({
      companyName: report.companyName,
      defaultFilename,
      pdfSuffix,
      timestamp: Date.now(),
    })

    if (!isValidManualPdfExportId(currentPdfReportId)) {
      toast.error(exportFailedTitle, {
        description: exportFailedDescription,
      })
      setIsExporting(false)
      return
    }

    const runId = ++exportRunIdRef.current
    const isCurrentRun = () => exportRunIdRef.current === runId
    isExportingRef.current = true
    setIsExporting(true)
    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    toast.loading(generatingTitle, { id: PDF_EXPORT_TOAST_ID })

    try {
      await downloadPdf(undefined, filename, abortController.signal, currentPdfReportId)
      if (!isCurrentRun()) return

      setDownloadHistory((prev) => [
        buildManualDownloadHistoryItem({
          id: crypto.randomUUID(),
          fileName: filename,
          timestamp: new Date(),
        }),
        ...prev,
      ])
      trackPDFDownload()
      toast.success(downloadedTitle)
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 402) {
        if (isCurrentRun()) openPdfPaywall()
        return
      }
      if (error instanceof APIError && isPdfTransientUpstreamStatus(error.statusCode)) {
        if (isCurrentRun()) toast.warning(transientDownloadHint)
        return
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      if (!isCurrentRun()) return
      generalLogger.error('[ManualValuationWorkspace] PDF export failed', {
        error: error instanceof Error ? error.message : String(error),
        code: error instanceof PdfRequestRefusedError ? error.refusal.code : undefined,
      })
      toast.error(exportFailedTitle, {
        description:
          error instanceof PdfRequestRefusedError
            ? describeRefusal(error.refusal)
            : exportFailedDescription,
      })
    } finally {
      if (isCurrentRun()) {
        toast.dismiss(PDF_EXPORT_TOAST_ID)
        setIsExporting(false)
        isExportingRef.current = false
        if (abortRef.current === abortController) {
          abortRef.current = null
        }
      }
    }
  }, [
    canDownloadPdf,
    defaultFilename,
    describeRefusal,
    downloadedTitle,
    downloadPdf,
    exportFailedDescription,
    exportFailedTitle,
    generatingTitle,
    openPdfPaywall,
    pdfStale,
    isPdfGenerating,
    pdfSuffix,
    report,
    currentPdfReportId,
    transientDownloadHint,
  ])

  return { isExporting, downloadHistory, handleExport }
}
