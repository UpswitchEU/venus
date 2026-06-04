import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { DownloadHistoryItem } from '../../../components/calculator'
import { APIError } from '../../../types/errors'
import { generalLogger } from '../../../utils/logger'
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
  downloadPdf: (
    url?: string,
    filename?: string,
    signal?: AbortSignal,
    reportIdOverride?: string | null
  ) => Promise<void>
  openPdfPaywall: () => void
  defaultFilename: string
  pdfSuffix: string
  staleHint: string
  exportFailedTitle: string
  exportFailedDescription: string
  generatingTitle: string
  downloadedTitle: string
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
  downloadPdf,
  openPdfPaywall,
  defaultFilename,
  pdfSuffix,
  staleHint,
  exportFailedTitle,
  exportFailedDescription,
  generatingTitle,
  downloadedTitle,
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
    if (pdfStale) {
      toast.warning(staleHint)
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
      toast.success(downloadedTitle)
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 402) {
        if (isCurrentRun()) openPdfPaywall()
        return
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      if (!isCurrentRun()) return
      generalLogger.error('[ManualLayout] PDF export failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      toast.error(exportFailedTitle, { description: exportFailedDescription })
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
    downloadedTitle,
    downloadPdf,
    exportFailedDescription,
    exportFailedTitle,
    generatingTitle,
    openPdfPaywall,
    pdfStale,
    pdfSuffix,
    report,
    currentPdfReportId,
    staleHint,
  ])

  return { isExporting, downloadHistory, handleExport }
}
