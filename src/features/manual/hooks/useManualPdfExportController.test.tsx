import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PdfRequestRefusedError } from '../../../hooks/pdfGenerationModel'
import { APIError } from '../../../types/errors'
import { useManualPdfExportController } from './useManualPdfExportController'

const toast = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('sonner', () => ({ toast }))

type ControllerParams = Parameters<typeof useManualPdfExportController>[0]

function makeParams(
  downloadPdf: ControllerParams['downloadPdf'],
  overrides: Partial<ControllerParams> = {}
): ControllerParams {
  return {
    report: { companyName: 'Acme BV' },
    reportId: 'report-1',
    resolvedReportId: 'report-1',
    canDownloadPdf: true,
    pdfStale: false,
    downloadPdf,
    openPdfPaywall: vi.fn(),
    defaultFilename: 'valuation',
    pdfSuffix: 'report',
    transientDownloadHint: 'Server temporarily unavailable',
    exportFailedTitle: 'PDF export failed',
    exportFailedDescription: 'Please try again',
    generatingTitle: 'Generating PDF',
    downloadedTitle: 'PDF downloaded',
    describeRefusal: (refusal) => `localized:${refusal.code}`,
    ...overrides,
  }
}

describe('useManualPdfExportController', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Object.values(toast).forEach((fn) => fn.mockReset())
  })

  it('ignores rapid duplicate export clicks while one export is in flight', async () => {
    let resolveDownload: (() => void) | null = null
    const downloadPdf = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDownload = resolve
        })
    )
    const { result } = renderHook(() => useManualPdfExportController(makeParams(downloadPdf)))

    let exportPromise: Promise<void> = Promise.resolve()
    act(() => {
      exportPromise = result.current.handleExport()
      void result.current.handleExport()
    })

    expect(result.current.isExporting).toBe(true)
    expect(downloadPdf).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDownload?.()
      await exportPromise
    })

    expect(result.current.isExporting).toBe(false)
    expect(result.current.downloadHistory).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith('PDF downloaded')
  })

  it('shows generating toast instead of stale warning while PDF job is in flight', async () => {
    const downloadPdf = vi.fn()
    const { result } = renderHook(() =>
      useManualPdfExportController(
        makeParams(downloadPdf, { pdfStale: true, isPdfGenerating: true })
      )
    )

    await act(async () => {
      await result.current.handleExport()
    })

    expect(downloadPdf).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith('Generating PDF', { id: 'pdf-gen' })
  })

  // F-04: a stale PDF with no job running (e.g. the background generation failed) used to
  // dead-end with "wait until the PDF has finished updating". The download route regenerates
  // on demand, so export goes there.
  it('exports a stale PDF through the on-demand download when no job is running', async () => {
    const downloadPdf = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useManualPdfExportController(
        makeParams(downloadPdf, { pdfStale: true, isPdfGenerating: false })
      )
    )

    await act(async () => {
      await result.current.handleExport()
    })

    expect(downloadPdf).toHaveBeenCalledTimes(1)
    expect(downloadPdf).toHaveBeenCalledWith(
      undefined,
      expect.stringContaining('Acme'),
      expect.any(AbortSignal),
      'report-1'
    )
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('PDF downloaded')
  })

  it("shows the server's reason when the report cannot be turned into a PDF", async () => {
    const downloadPdf = vi.fn().mockRejectedValue(
      new PdfRequestRefusedError(
        {
          code: 'SEALED_REPORT_INPUT_INCOMPLETE',
          remediation: 'Complete the client and engagement details, then export again.',
        },
        422
      )
    )
    const { result } = renderHook(() =>
      useManualPdfExportController(makeParams(downloadPdf, { pdfStale: true }))
    )

    await act(async () => {
      await result.current.handleExport()
    })

    expect(toast.error).toHaveBeenCalledWith('PDF export failed', {
      description: 'localized:SEALED_REPORT_INPUT_INCOMPLETE',
    })
  })

  it('keeps the generic failure copy for untyped errors', async () => {
    const downloadPdf = vi
      .fn()
      .mockRejectedValue(new Error('Server returned HTML instead of a PDF.'))
    const { result } = renderHook(() => useManualPdfExportController(makeParams(downloadPdf)))

    await act(async () => {
      await result.current.handleExport()
    })

    expect(toast.error).toHaveBeenCalledWith('PDF export failed', {
      description: 'Please try again',
    })
  })

  it('warns on transient download errors without a hard export failure toast', async () => {
    const downloadPdf = vi.fn().mockRejectedValue(new APIError('pooler blip', 503))
    const { result } = renderHook(() => useManualPdfExportController(makeParams(downloadPdf)))

    await act(async () => {
      await result.current.handleExport()
    })

    expect(toast.warning).toHaveBeenCalledWith('Server temporarily unavailable')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('aborts and ignores stale export completion after the report id changes', async () => {
    let resolveDownload: (() => void) | null = null
    let signal: AbortSignal | undefined
    const downloadPdf = vi.fn((_url?: string, _filename?: string, incomingSignal?: AbortSignal) => {
      signal = incomingSignal
      return new Promise<void>((resolve) => {
        resolveDownload = resolve
      })
    })
    const { result, rerender } = renderHook(
      (params: ControllerParams) => useManualPdfExportController(params),
      { initialProps: makeParams(downloadPdf) }
    )

    let exportPromise: Promise<void> = Promise.resolve()
    act(() => {
      exportPromise = result.current.handleExport()
    })

    expect(result.current.isExporting).toBe(true)
    expect(signal?.aborted).toBe(false)

    act(() => {
      rerender(makeParams(downloadPdf, { reportId: 'report-2', resolvedReportId: 'report-2' }))
    })

    expect(signal?.aborted).toBe(true)
    expect(result.current.isExporting).toBe(false)
    expect(toast.dismiss).toHaveBeenCalledWith('pdf-gen')

    await act(async () => {
      resolveDownload?.()
      await exportPromise
    })

    expect(result.current.downloadHistory).toHaveLength(0)
    expect(toast.success).not.toHaveBeenCalled()
  })
})
