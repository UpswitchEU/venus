import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationReportData } from '../../../components/calculator'
import type { ValuationResponse } from '../../../types/valuation'
import { useManualReportRefreshAfterEdit } from './useManualReportRefreshAfterEdit'

const getReport = vi.fn()

vi.mock('../../../services/backendApi', () => ({
  backendAPI: {
    getReport: (...args: unknown[]) => getReport(...args),
  },
}))

const REPORT_ID = '35a422c3-028f-4d46-88e5-27ac5519826c'
const UPDATED_AT = '2026-05-28T10:00:00.000Z'
const PDF_AT = '2026-05-28T10:00:01.000Z'

function makeFreshReport(): ValuationResponse {
  return {
    valuation_id: 'val_1',
    html_report: '<div>report</div>',
    updated_at: UPDATED_AT,
    pdf_generated_at: PDF_AT,
    pdf_url: 'https://cdn.example/pdf.pdf',
    valuation_results: { dcf: { available: true, value: 1_000_000 } },
  } as ValuationResponse
}

beforeEach(() => {
  getReport.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useManualReportRefreshAfterEdit', () => {
  it('does not regenerate PDF when the refreshed report PDF is still fresh', async () => {
    getReport.mockResolvedValue(makeFreshReport())
    const generatePdf = vi.fn().mockResolvedValue('https://cdn.example/new.pdf')
    const setReport = vi.fn()
    const setResult = vi.fn()

    const { result } = renderHook(() =>
      useManualReportRefreshAfterEdit({
        canDownloadPdf: true,
        generatePdf,
        persistedReportLookupId: REPORT_ID,
        setReport,
        setResult,
      })
    )

    await act(async () => {
      await result.current.refreshReportAfterEdit('<div>patch</div>')
    })

    expect(getReport).toHaveBeenCalledWith(REPORT_ID)
    expect(generatePdf).not.toHaveBeenCalled()
  })

  it('regenerates PDF when the refreshed report PDF is stale', async () => {
    getReport.mockResolvedValue({
      ...makeFreshReport(),
      pdf_generated_at: '2026-05-27T10:00:00.000Z',
    })
    const generatePdf = vi.fn().mockResolvedValue('https://cdn.example/new.pdf')
    const setReport = vi.fn(
      (updater: (prev: ValuationReportData | null) => ValuationReportData | null) => {
        updater({
          id: REPORT_ID,
          htmlReport: '<div>old</div>',
        } as ValuationReportData)
      }
    )

    const { result } = renderHook(() =>
      useManualReportRefreshAfterEdit({
        canDownloadPdf: true,
        generatePdf,
        persistedReportLookupId: REPORT_ID,
        setReport,
        setResult: vi.fn(),
      })
    )

    await act(async () => {
      await result.current.refreshReportAfterEdit('<div>patch</div>')
    })

    expect(generatePdf).toHaveBeenCalledTimes(1)
  })

  it('skips regenerate when async PDF generation is already in flight', async () => {
    getReport.mockResolvedValue({
      ...makeFreshReport(),
      pdf_generated_at: '2026-05-27T10:00:00.000Z',
    })
    const generatePdf = vi.fn().mockResolvedValue('https://cdn.example/new.pdf')
    const setReport = vi.fn(
      (updater: (prev: ValuationReportData | null) => ValuationReportData | null) => {
        updater({
          id: REPORT_ID,
          htmlReport: '<div>old</div>',
        } as ValuationReportData)
      }
    )

    const { result } = renderHook(() =>
      useManualReportRefreshAfterEdit({
        canDownloadPdf: true,
        generatePdf,
        isPdfGenerating: true,
        persistedReportLookupId: REPORT_ID,
        setReport,
        setResult: vi.fn(),
      })
    )

    await act(async () => {
      await result.current.refreshReportAfterEdit('<div>patch</div>')
    })

    expect(generatePdf).not.toHaveBeenCalled()
  })

  it('force-regenerates PDF from patch HTML when getReport fails', async () => {
    getReport.mockRejectedValue(new Error('timeout'))
    const generatePdf = vi.fn().mockResolvedValue('https://cdn.example/new.pdf')
    const setReport = vi.fn(
      (updater: (prev: ValuationReportData | null) => ValuationReportData | null) => {
        updater({
          id: REPORT_ID,
          htmlReport: '<div>old</div>',
        } as ValuationReportData)
      }
    )

    const { result } = renderHook(() =>
      useManualReportRefreshAfterEdit({
        canDownloadPdf: true,
        generatePdf,
        persistedReportLookupId: REPORT_ID,
        setReport,
        setResult: vi.fn(),
      })
    )

    await act(async () => {
      const ok = await result.current.refreshReportAfterEdit('<div>patch html</div>')
      expect(ok).toBe(false)
    })

    expect(generatePdf).toHaveBeenCalledTimes(1)
  })
})
