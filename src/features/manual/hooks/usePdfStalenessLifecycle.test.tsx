import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  makeParams,
  makeReport,
  resetPdfStalenessHarness,
  restorePdfStalenessHarness,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle.testHarness'

describe('usePdfStalenessLifecycle pdfStale derivation', () => {
  beforeEach(() => {
    resetPdfStalenessHarness()
  })

  afterEach(() => {
    restorePdfStalenessHarness()
  })

  it('returns false when no report is present', () => {
    const { result } = renderHook(() => usePdfStalenessLifecycle(makeParams({ report: null })))
    expect(result.current.pdfStale).toBe(false)
  })

  it('returns true when reportUpdatedAt is newer than pdfGeneratedAt', () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const { result } = renderHook(() =>
      usePdfStalenessLifecycle(makeParams({ report, persistedReportLookupId: null }))
    )
    expect(result.current.pdfStale).toBe(true)
  })

  it('returns false when local PDF is ready but report.pdfGeneratedAt is still null', () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: null,
    })
    const { result } = renderHook(() =>
      usePdfStalenessLifecycle(
        makeParams({ report, isPdfReady: true, persistedReportLookupId: null })
      )
    )
    expect(result.current.pdfStale).toBe(false)
  })

  it('returns false when local PDF is ready with a URL even if pdfGeneratedAt lags', () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const { result } = renderHook(() =>
      usePdfStalenessLifecycle(
        makeParams({
          report,
          isPdfReady: true,
          pdfGenerationState: { url: 'https://example/fresh.pdf' },
          persistedReportLookupId: null,
        })
      )
    )
    expect(result.current.pdfStale).toBe(false)
  })
})

describe('usePdfStalenessLifecycle client-side PDF URL mirror', () => {
  beforeEach(() => {
    resetPdfStalenessHarness()
  })

  afterEach(() => {
    restorePdfStalenessHarness()
  })

  it('writes the generated URL into report when isPdfReady + canDownloadPdf are true', () => {
    const params = makeParams({
      isPdfReady: true,
      pdfGenerationState: { url: 'https://example/local.pdf' },
      persistedReportLookupId: null,
    })
    renderHook(() => usePdfStalenessLifecycle(params))
    expect(params.setReport).toHaveBeenCalled()
  })

  it('does not write when canDownloadPdf is false', () => {
    const params = makeParams({
      isPdfReady: true,
      canDownloadPdf: false,
      pdfGenerationState: { url: 'https://example/local.pdf' },
      persistedReportLookupId: null,
    })
    renderHook(() => usePdfStalenessLifecycle(params))
    expect(params.setReport).not.toHaveBeenCalled()
  })

  it('does not write when no URL is available', () => {
    const params = makeParams({
      isPdfReady: true,
      pdfGenerationState: { url: null },
      persistedReportLookupId: null,
    })
    renderHook(() => usePdfStalenessLifecycle(params))
    expect(params.setReport).not.toHaveBeenCalled()
  })
})
