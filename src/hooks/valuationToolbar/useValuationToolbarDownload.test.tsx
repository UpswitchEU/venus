import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APIError } from '../../types/errors'
import type { UsePdfGenerationReturn } from '../usePdfGeneration'
import {
  type UseValuationToolbarDownloadOptions,
  useValuationToolbarDownload,
} from './useValuationToolbarDownload'

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
}))
const usePdfGenerationMock = vi.hoisted(() => vi.fn())
const generalLogger = vi.hoisted(() => ({
  error: vi.fn(),
}))

vi.mock('sonner', () => ({ toast }))
vi.mock('../usePdfGeneration', () => ({ usePdfGeneration: usePdfGenerationMock }))
vi.mock('../../utils/logger', () => ({ generalLogger }))

const translateToast: UseValuationToolbarDownloadOptions['translateToast'] = (key) => key

function makePdfGenerationReturn(
  overrides: Partial<UsePdfGenerationReturn> = {}
): UsePdfGenerationReturn {
  return {
    state: { status: 'none', url: null, error: null, progress: 0 },
    generatePdf: vi.fn(),
    downloadPdf: vi.fn().mockResolvedValue(undefined),
    isReady: false,
    isGenerating: false,
    ...overrides,
  }
}

function makeOptions(
  overrides: Partial<UseValuationToolbarDownloadOptions> = {}
): UseValuationToolbarDownloadOptions {
  return {
    reportId: 'report-1',
    translateToast,
    ...overrides,
  }
}

describe('useValuationToolbarDownload', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses the caller-provided download override without invoking BFF PDF download', async () => {
    const downloadPdf = vi.fn().mockResolvedValue(undefined)
    const onDownload = vi.fn()
    usePdfGenerationMock.mockReturnValue(makePdfGenerationReturn({ downloadPdf }))
    const { result } = renderHook(() => useValuationToolbarDownload(makeOptions({ onDownload })))

    await act(async () => {
      await result.current.handleDownload()
    })

    expect(onDownload).toHaveBeenCalledTimes(1)
    expect(downloadPdf).not.toHaveBeenCalled()
  })

  it('ignores duplicate download clicks while a report download is in flight', async () => {
    let resolveDownload: (() => void) | null = null
    const downloadPdf = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDownload = resolve
        })
    )
    usePdfGenerationMock.mockReturnValue(makePdfGenerationReturn({ downloadPdf }))
    const { result } = renderHook(() => useValuationToolbarDownload(makeOptions()))

    let downloadPromise: Promise<void> = Promise.resolve()
    act(() => {
      downloadPromise = result.current.handleDownload()
      void result.current.handleDownload()
    })

    expect(result.current.isPdfDownloading).toBe(true)
    expect(result.current.isDownloading).toBe(true)
    expect(downloadPdf).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDownload?.()
      await downloadPromise
    })

    expect(result.current.isPdfDownloading).toBe(false)
    expect(result.current.isDownloading).toBe(false)
  })

  it('aborts an in-flight download and ignores stale completion after report id changes', async () => {
    let resolveDownload: (() => void) | null = null
    let downloadSignal: AbortSignal | undefined
    const downloadPdf = vi.fn((_url?: string, _filename?: string, signal?: AbortSignal) => {
      downloadSignal = signal
      return new Promise<void>((resolve) => {
        resolveDownload = resolve
      })
    })
    usePdfGenerationMock.mockReturnValue(makePdfGenerationReturn({ downloadPdf }))
    const { result, rerender } = renderHook(
      (options: UseValuationToolbarDownloadOptions) => useValuationToolbarDownload(options),
      { initialProps: makeOptions() }
    )

    let downloadPromise: Promise<void> = Promise.resolve()
    act(() => {
      downloadPromise = result.current.handleDownload()
    })

    expect(result.current.isPdfDownloading).toBe(true)
    expect(downloadSignal?.aborted).toBe(false)

    act(() => {
      rerender(makeOptions({ reportId: 'report-2' }))
    })

    expect(downloadSignal?.aborted).toBe(true)
    expect(result.current.isPdfDownloading).toBe(false)

    await act(async () => {
      resolveDownload?.()
      await downloadPromise
    })

    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('shows the paywall toast for 402 PDF download failures', async () => {
    const downloadPdf = vi.fn().mockRejectedValue(new APIError('plan blocked', 402))
    usePdfGenerationMock.mockReturnValue(makePdfGenerationReturn({ downloadPdf }))
    const { result } = renderHook(() => useValuationToolbarDownload(makeOptions()))

    await act(async () => {
      await result.current.handleDownload()
    })

    expect(toast.error).toHaveBeenCalledWith('pdfDownloadPlanBlocked', {
      description: 'pdfDownloadPlanBlockedDesc',
    })
  })

  it('warns on transient upstream failures without logging a hard export failure', async () => {
    const downloadPdf = vi.fn().mockRejectedValue(new APIError('pooler blip', 503))
    usePdfGenerationMock.mockReturnValue(makePdfGenerationReturn({ downloadPdf }))
    const { result } = renderHook(() => useValuationToolbarDownload(makeOptions()))

    await act(async () => {
      await result.current.handleDownload()
    })

    expect(toast.warning).toHaveBeenCalledWith('pdfPollDegradedHint')
    expect(toast.error).not.toHaveBeenCalled()
    expect(generalLogger.error).not.toHaveBeenCalled()
  })
})
