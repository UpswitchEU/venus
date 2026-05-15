import type { DownloadHistoryItem } from '@/components/calculator'

export interface BuildManualPdfFilenameParams {
  companyName?: string | null
  defaultFilename: string
  pdfSuffix: string
  timestamp: number
}

export function buildManualPdfFilename({
  companyName,
  defaultFilename,
  pdfSuffix,
  timestamp,
}: BuildManualPdfFilenameParams): string {
  const baseName = companyName?.replace(/\s+/g, '-') || defaultFilename
  return `${baseName}-${pdfSuffix}-${timestamp}.pdf`
}

export function isValidManualPdfExportId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value !== 'new'
}

export interface BuildManualDownloadHistoryItemParams {
  id: string
  fileName: string
  timestamp: Date
}

export function buildManualDownloadHistoryItem({
  id,
  fileName,
  timestamp,
}: BuildManualDownloadHistoryItemParams): DownloadHistoryItem {
  return {
    id,
    fileName,
    timestamp,
    size: 'PDF',
  }
}
