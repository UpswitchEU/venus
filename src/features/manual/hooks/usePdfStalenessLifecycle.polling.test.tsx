import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError } from '@/types/errors'
import type { ValuationResponse } from '@/types/valuation'
import {
  makeFreshResponse,
  makeParams,
  makeReport,
  resetPdfStalenessHarness,
  restorePdfStalenessHarness,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle.testHarness'

describe('usePdfStalenessLifecycle polling kickoff', () => {
  beforeEach(() => {
    resetPdfStalenessHarness()
  })

  afterEach(() => {
    restorePdfStalenessHarness()
  })

  it('polls immediately when a stale cycle begins', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const getReport = vi.fn().mockResolvedValue(makeFreshResponse())
    renderHook(() => usePdfStalenessLifecycle(makeParams({ report, getReport })))

    await act(async () => {
      await Promise.resolve()
    })

    expect(getReport).toHaveBeenCalledTimes(1)
  })

  it('does not poll when persistedReportLookupId is null', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const getReport = vi.fn().mockResolvedValue(makeFreshResponse())
    renderHook(() =>
      usePdfStalenessLifecycle(makeParams({ report, getReport, persistedReportLookupId: null }))
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(getReport).not.toHaveBeenCalled()
  })

  it('does not poll while pdfStale is false', async () => {
    const fresh = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T14:00:01Z'),
    })
    const getReport = vi.fn().mockResolvedValue(makeFreshResponse())
    renderHook(() => usePdfStalenessLifecycle(makeParams({ report: fresh, getReport })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(getReport).not.toHaveBeenCalled()
  })

  it('surfaces stalled banner after unchanged stale pdf_generated_at streak', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const staleResponse = {
      ...makeFreshResponse(),
      updated_at: '2026-05-01T14:00:00.000Z',
      pdf_generated_at: '2026-05-01T13:00:00.000Z',
      pdf_url: 'https://example/old.pdf',
    } as ValuationResponse
    const getReport = vi.fn().mockResolvedValue(staleResponse)
    const { result } = renderHook(() => usePdfStalenessLifecycle(makeParams({ report, getReport })))

    await act(async () => {
      for (let i = 0; i < 12; i++) {
        await vi.advanceTimersByTimeAsync(2_500)
      }
    })

    expect(result.current.pdfWaitTimedOut).toBe(true)
    expect(getReport.mock.calls.length).toBeGreaterThanOrEqual(12)
  })

  it('never surfaces stalled when polls report pdf_coherent=true despite stale timestamps', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const coherentResponse = {
      ...makeFreshResponse(),
      updated_at: '2026-05-01T14:00:00.000Z',
      pdf_generated_at: '2026-05-01T13:00:00.000Z',
      pdf_url: 'https://example/old.pdf',
      pdf_coherent: true,
    } as ValuationResponse
    const getReport = vi.fn().mockResolvedValue(coherentResponse)
    const { result } = renderHook(() => usePdfStalenessLifecycle(makeParams({ report, getReport })))

    await act(async () => {
      for (let i = 0; i < 12; i++) {
        await vi.advanceTimersByTimeAsync(2_500)
      }
    })

    expect(result.current.pdfWaitTimedOut).toBe(false)
  })

  it('does not poll once stalled after the 60s wait timer fires', async () => {
    const report = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const getReport = vi.fn().mockRejectedValue(new APIError('whatever', 500))
    const { result } = renderHook(() => usePdfStalenessLifecycle(makeParams({ report, getReport })))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001)
    })
    expect(result.current.pdfWaitTimedOut).toBe(true)

    const callsBeforeStall = getReport.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(getReport.mock.calls.length).toBe(callsBeforeStall)
  })

  it('does not let an obsolete poll unlock the current report poll', async () => {
    const pendingPolls = new Map<string, (response: ValuationResponse) => void>()
    const getReport = vi.fn(
      (lookupId: string) =>
        new Promise<ValuationResponse>((resolve) => {
          pendingPolls.set(lookupId, resolve)
        })
    )
    const reportA = makeReport({
      reportUpdatedAt: new Date('2026-05-01T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-01T13:00:00Z'),
    })
    const reportB = makeReport({
      id: 'rep_2',
      reportUpdatedAt: new Date('2026-05-02T14:00:00Z'),
      pdfGeneratedAt: new Date('2026-05-02T13:00:00Z'),
    })
    const paramsA = makeParams({
      report: reportA,
      getReport,
      persistedReportLookupId: 'uuid-A',
    })
    const { rerender } = renderHook((params) => usePdfStalenessLifecycle(params), {
      initialProps: paramsA,
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(getReport.mock.calls.map(([lookupId]) => lookupId)).toEqual(['uuid-A'])

    await act(async () => {
      rerender({ ...paramsA, report: reportB, persistedReportLookupId: 'uuid-B' })
      await Promise.resolve()
    })
    expect(getReport.mock.calls.map(([lookupId]) => lookupId)).toEqual(['uuid-A', 'uuid-B'])

    await act(async () => {
      pendingPolls.get('uuid-A')?.(makeFreshResponse({ valuation_id: 'rep_A' }))
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500)
    })

    expect(getReport.mock.calls.map(([lookupId]) => lookupId)).toEqual(['uuid-A', 'uuid-B'])

    await act(async () => {
      pendingPolls.get('uuid-B')?.(makeFreshResponse({ valuation_id: 'rep_B' }))
      await Promise.resolve()
    })
  })
})
