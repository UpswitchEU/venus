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
  downloadPdf: (url?: string, filename?: string, signal?: AbortSignal) => Promise<void>
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

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const handleExport = useCallback(async () => {
    if (!report) return
    if (!canDownloadPdf) {
      openPdfPaywall()
      return
    }
    if (pdfStale) {
      toast.warning(staleHint)
      return
    }

    setIsExporting(true)
    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    const filename = buildManualPdfFilename({
      companyName: report.companyName,
      defaultFilename,
      pdfSuffix,
      timestamp: Date.now(),
    })

    const idForPdf = resolvedReportId ?? reportId
    if (!isValidManualPdfExportId(idForPdf)) {
      toast.error(exportFailedTitle, {
        description: exportFailedDescription,
      })
      setIsExporting(false)
      return
    }

    toast.loading(generatingTitle, { id: PDF_EXPORT_TOAST_ID })

    try {
      await downloadPdf(undefined, filename, abortController.signal)

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
        openPdfPaywall()
        return
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      generalLogger.error('[ManualLayout] PDF export failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      toast.error(exportFailedTitle, { description: exportFailedDescription })
    } finally {
      toast.dismiss(PDF_EXPORT_TOAST_ID)
      setIsExporting(false)
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
    reportId,
    resolvedReportId,
    staleHint,
  ])

  return { isExporting, downloadHistory, handleExport }
}
