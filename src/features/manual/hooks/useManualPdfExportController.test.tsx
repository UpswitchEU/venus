import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useManualPdfExportController } from './useManualPdfExportController'

const toast = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
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
    staleHint: 'PDF is stale',
    exportFailedTitle: 'PDF export failed',
    exportFailedDescription: 'Please try again',
    generatingTitle: 'Generating PDF',
    downloadedTitle: 'PDF downloaded',
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
