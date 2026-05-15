// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildManualDownloadHistoryItem,
  buildManualPdfFilename,
  isValidManualPdfExportId,
} from './manualPdfExport'

describe('manualPdfExport', () => {
  it('builds stable PDF filenames from company name or fallback label', () => {
    expect(
      buildManualPdfFilename({
        companyName: 'Acme Holdings BV',
        defaultFilename: 'valuation',
        pdfSuffix: 'report',
        timestamp: 123,
      })
    ).toBe('Acme-Holdings-BV-report-123.pdf')

    expect(
      buildManualPdfFilename({
        companyName: '',
        defaultFilename: 'valuation',
        pdfSuffix: 'report',
        timestamp: 123,
      })
    ).toBe('valuation-report-123.pdf')
  })

  it('validates export ids', () => {
    expect(isValidManualPdfExportId('report-1')).toBe(true)
    expect(isValidManualPdfExportId('new')).toBe(false)
    expect(isValidManualPdfExportId('   ')).toBe(false)
    expect(isValidManualPdfExportId(null)).toBe(false)
  })

  it('builds download history items', () => {
    const timestamp = new Date('2026-01-01T00:00:00.000Z')
    expect(
      buildManualDownloadHistoryItem({
        id: 'download-1',
        fileName: 'valuation.pdf',
        timestamp,
      })
    ).toEqual({
      id: 'download-1',
      fileName: 'valuation.pdf',
      timestamp,
      size: 'PDF',
    })
  })
})
