import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationReportData } from '../../../components/calculator'
import { useManualResultsStore } from '../../../store/manual'
import { useClientContext } from '../../../stores/clientContext'
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
  useManualResultsStore.setState({ result: null })
  useClientContext.setState({ isActingAsClient: false, relationshipId: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useManualReportRefreshAfterEdit', () => {
  function deferredReport() {
    let resolve!: (value: ValuationResponse) => void
    let reject!: (reason: Error) => void
    const promise = new Promise<ValuationResponse>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it.each([
    'navigate',
    'away-and-back',
    'unmount',
    'client-switch',
    'client-away-and-back',
    'new-result',
  ])('ignores a pending refresh after %s', async (change) => {
    const pending = deferredReport()
    getReport.mockReturnValueOnce(pending.promise)
    const setReport = vi.fn()
    const setResult = vi.fn()
    const generatePdf = vi.fn().mockResolvedValue(null)
    const { result, rerender, unmount } = renderHook(
      ({ id }) =>
        useManualReportRefreshAfterEdit({
          canDownloadPdf: true,
          generatePdf,
          persistedReportLookupId: id,
          setReport,
          setResult,
        }),
      { initialProps: { id: REPORT_ID } }
    )
    const refresh = result.current.refreshReportAfterEdit('<div>patch</div>')
    if (change === 'unmount') unmount()
    else if (change.startsWith('client-')) {
      useClientContext.setState({ isActingAsClient: true, relationshipId: 'other-client' })
      if (change === 'client-away-and-back') {
        useClientContext.setState({ isActingAsClient: false, relationshipId: null })
      }
    } else if (change === 'new-result') {
      useManualResultsStore.setState({
        result: { ...makeFreshReport(), valuation_id: 'val_newer' },
      })
    } else {
      rerender({ id: 'another-report' })
      if (change === 'away-and-back') rerender({ id: REPORT_ID })
    }
    await act(async () => {
      pending.resolve({ ...makeFreshReport(), pdf_generated_at: null })
      expect(await refresh).toBe(false)
    })
    expect(setResult).not.toHaveBeenCalled()
    expect(setReport).not.toHaveBeenCalled()
    expect(generatePdf).not.toHaveBeenCalled()
  })

  it('does not apply patch fallback or generate a PDF after navigation', async () => {
    const pending = deferredReport()
    getReport.mockReturnValueOnce(pending.promise)
    const setReport = vi.fn()
    const setResult = vi.fn()
    const generatePdf = vi.fn().mockResolvedValue(null)
    const { result, rerender } = renderHook(
      ({ id }) =>
        useManualReportRefreshAfterEdit({
          canDownloadPdf: true,
          generatePdf,
          persistedReportLookupId: id,
          setReport,
          setResult,
        }),
      { initialProps: { id: REPORT_ID } }
    )
    const refresh = result.current.refreshReportAfterEdit('<div>old patch</div>')
    rerender({ id: 'another-report' })
    await act(async () => {
      pending.reject(new Error('timeout'))
      await refresh
    })
    expect(setReport).not.toHaveBeenCalled()
    expect(setResult).not.toHaveBeenCalled()
    expect(generatePdf).not.toHaveBeenCalled()
  })

  it('ignores an older refresh that finishes after the newer refresh', async () => {
    const older = deferredReport()
    getReport
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ ...makeFreshReport(), valuation_id: 'val_newer' })
    const setResult = vi.fn()
    const { result } = renderHook(() =>
      useManualReportRefreshAfterEdit({
        canDownloadPdf: false,
        persistedReportLookupId: REPORT_ID,
        setReport: vi.fn(),
        setResult,
      })
    )
    const first = result.current.refreshReportAfterEdit()
    await act(async () => {
      await result.current.refreshReportAfterEdit()
    })
    await act(async () => {
      older.resolve(makeFreshReport())
      expect(await first).toBe(false)
    })
    expect(setResult).toHaveBeenCalledTimes(1)
    expect(setResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ valuation_id: 'val_newer' })
    )
  })

  it('uses server HTML and PDF fingerprints after an edit even when dates suggest a fresh PDF', async () => {
    getReport.mockResolvedValue({
      ...makeFreshReport(),
      render_fingerprint: 'new',
      pdf_render_fingerprint: 'old',
      pdf_coherent: false,
    })
    const generatePdf = vi.fn().mockResolvedValue(null)
    const setResult = vi.fn()
    let report = {
      id: REPORT_ID,
      htmlReport: '<div>old</div>',
      pdfCoherent: true,
    } as ValuationReportData
    const { result } = renderHook(() =>
      useManualReportRefreshAfterEdit({
        canDownloadPdf: true,
        generatePdf,
        persistedReportLookupId: REPORT_ID,
        setResult,
        setReport: (update) => {
          const next = typeof update === 'function' ? update(report) : update
          if (next) report = next
        },
      })
    )
    await act(async () => {
      await result.current.refreshReportAfterEdit('<div>earlier patch</div>')
    })
    expect(report).toMatchObject({
      htmlReport: '<div>report</div>',
      renderFingerprint: 'new',
      pdfRenderFingerprint: 'old',
      pdfCoherent: false,
    })
    expect(setResult).toHaveBeenCalledWith(
      expect.objectContaining({ html_report: '<div>report</div>' })
    )
    expect(generatePdf).toHaveBeenCalledTimes(1)
  })

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
