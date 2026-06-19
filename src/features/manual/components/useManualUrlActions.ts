import { useEffect, useRef } from 'react'

export function useManualUrlActions({
  attestReportId,
  canDownloadPdf,
  handleExport,
  handlePreview,
  isExporting,
  isPdfGenerating,
  pdfStale,
  report,
  urlAction,
}: {
  attestReportId: string | null
  canDownloadPdf: boolean
  handleExport: () => void
  handlePreview: () => void
  isExporting: boolean
  isPdfGenerating: boolean
  pdfStale: boolean
  report: unknown
  urlAction?: string | null
}) {
  const downloadHandledForRef = useRef<string | null>(null)
  useEffect(() => {
    if (urlAction !== 'download') return
    if (!report || pdfStale || isPdfGenerating || !canDownloadPdf || isExporting) return
    if (!attestReportId || attestReportId === 'new') return
    if (downloadHandledForRef.current === attestReportId) return
    downloadHandledForRef.current = attestReportId
    void handleExport()
  }, [
    attestReportId,
    canDownloadPdf,
    handleExport,
    isExporting,
    isPdfGenerating,
    pdfStale,
    report,
    urlAction,
  ])

  const previewHandledForRef = useRef<string | null>(null)
  useEffect(() => {
    if (urlAction !== 'preview') return
    if (!report || !attestReportId || attestReportId === 'new') return
    if (previewHandledForRef.current === attestReportId) return
    previewHandledForRef.current = attestReportId
    handlePreview()
  }, [attestReportId, handlePreview, report, urlAction])
}
