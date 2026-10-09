import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualResultsStore } from '@/store/manual'
import { useClientContext } from '@/stores/clientContext'
import type { ValuationResponse } from '@/types/valuation'
import {
  makeFreshResponse,
  makeParams,
  makeReport,
  resetPdfStalenessHarness,
  restorePdfStalenessHarness,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle.testHarness'

describe('PDF refresh scope and snapshot consistency', () => {
  beforeEach(() => {
    resetPdfStalenessHarness()
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
  })
  afterEach(() => {
    restorePdfStalenessHarness()
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
  })

  it.each([
    'poll',
    'retry',
  ])('%s discards an old response after switching client and back', async (path) => {
    let resolve!: (value: ValuationResponse) => void
    const getReport = vi.fn(
      () =>
        new Promise<ValuationResponse>((res) => {
          resolve = res
        })
    )
    const params = makeParams({
      getReport,
      ...(path === 'retry'
        ? { report: makeReport({ pdfGeneratedAt: new Date('2026-05-01T14:00:00Z') }) }
        : {}),
    })
    const { result } = renderHook(() => usePdfStalenessLifecycle(params))
    let retry: Promise<void> | undefined
    await act(async () => {
      if (path === 'retry') retry = result.current.retry()
      await Promise.resolve()
    })
    expect(getReport).toHaveBeenCalledTimes(1)
    useClientContext.setState({ isActingAsClient: true, relationshipId: 'other-client' })
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
    await act(async () => {
      resolve(makeFreshResponse())
      await retry
    })
    expect(params.setResult).not.toHaveBeenCalled()
    expect(params.setReport).not.toHaveBeenCalled()
    expect(params.showRetryFailureToast).not.toHaveBeenCalled()
  })

  it('does not overwrite a newly calculated result with an earlier poll', async () => {
    let resolve!: (value: ValuationResponse) => void
    const getReport = vi.fn(
      () =>
        new Promise<ValuationResponse>((res) => {
          resolve = res
        })
    )
    const params = makeParams({ getReport })
    renderHook(() => usePdfStalenessLifecycle(params))
    useManualResultsStore.setState({ result: makeFreshResponse({ valuation_id: 'val_new' }) })
    await act(async () => {
      resolve(makeFreshResponse({ valuation_id: 'val_old' }))
    })
    expect(params.setResult).not.toHaveBeenCalled()
  })

  it('does not complete a retry after navigating away and back', async () => {
    let resolve!: (value: ValuationResponse) => void
    const getReport = vi.fn(
      () =>
        new Promise<ValuationResponse>((res) => {
          resolve = res
        })
    )
    const params = makeParams({
      getReport,
      report: makeReport({ pdfGeneratedAt: new Date('2026-05-01T14:00:00Z') }),
    })
    const { result, rerender } = renderHook((props) => usePdfStalenessLifecycle(props), {
      initialProps: params,
    })
    let retry!: Promise<void>
    await act(async () => {
      retry = result.current.retry()
      await Promise.resolve()
    })
    rerender({ ...params, persistedReportLookupId: 'another-report' })
    rerender(params)
    await act(async () => {
      resolve(makeFreshResponse())
      await retry
    })
    expect(params.setResult).not.toHaveBeenCalled()
    expect(params.setReport).not.toHaveBeenCalled()
  })

  it('replaces the preview and clears an obsolete asking price together with a new snapshot', async () => {
    const params = makeParams({
      getReport: vi
        .fn()
        .mockResolvedValue(
          makeFreshResponse({ html_report: '<main>New snapshot</main>', render_fingerprint: 'new' })
        ),
    })
    renderHook(() => usePdfStalenessLifecycle(params))
    await act(async () => {
      await Promise.resolve()
    })
    const update = vi.mocked(params.setReport).mock.calls[0][0]
    const updated = update(
      makeReport({ htmlReport: '<main>Old snapshot</main>', recommendedAskingPrice: 1_500_000 })
    )
    expect(updated).toMatchObject({
      htmlReport: '<main>New snapshot</main>',
      renderFingerprint: 'new',
    })
    expect(updated?.recommendedAskingPrice).toBeUndefined()
  })
})
