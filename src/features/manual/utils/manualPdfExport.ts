import type { DownloadHistoryItem } from '@/components/calculator'

export interface BuildManualPdfFilenameParams {
  companyName?: string | null
  defaultFilename: string
  pdfSuffix: string
  timestamp: number
}

const MAX_FILENAME_PART_LENGTH = 96

export function sanitizeManualPdfFilenamePart(
  value: string | null | undefined,
  fallback: string
): string {
  const sanitized = (value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, MAX_FILENAME_PART_LENGTH)

  if (sanitized) return sanitized
  return sanitizeManualPdfFilenamePart(fallback || 'valuation', 'valuation')
}

export function buildManualPdfFilename({
  companyName,
  defaultFilename,
  pdfSuffix,
  timestamp,
}: BuildManualPdfFilenameParams): string {
  const baseName = sanitizeManualPdfFilenamePart(companyName, defaultFilename)
  const suffix = sanitizeManualPdfFilenamePart(pdfSuffix, 'report')
  return `${baseName}-${suffix}-${timestamp}.pdf`
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
