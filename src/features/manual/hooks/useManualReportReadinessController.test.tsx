import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationReportData } from '@/components/calculator'
import { usePdfGeneration } from '@/hooks/usePdfGeneration'
import { backendAPI } from '@/services/backendApi'
import type { ValuationResponse, ValuationSession } from '@/types/valuation'
import { useManualReportHtmlRecovery } from './useManualReportHtmlRecovery'
import { useManualReportMethodHydration } from './useManualReportMethodHydration'
import {
  type UseManualReportReadinessControllerParams,
  useManualReportReadinessController,
} from './useManualReportReadinessController'
import {
  type UsePdfStalenessLifecycleParams,
  usePdfStalenessLifecycle,
} from './usePdfStalenessLifecycle'

vi.mock('@/hooks/usePdfGeneration', () => ({
  usePdfGeneration: vi.fn(),
}))

vi.mock('@/services/backendApi', () => ({
  backendAPI: {
    getReport: vi.fn(),
  },
}))

vi.mock('./useManualReportHtmlRecovery', () => ({
  useManualReportHtmlRecovery: vi.fn(),
}))

vi.mock('./useManualReportMethodHydration', () => ({
  useManualReportMethodHydration: vi.fn(),
}))

vi.mock('./usePdfStalenessLifecycle', () => ({
  usePdfStalenessLifecycle: vi.fn(),
}))

const usePdfGenerationMock = vi.mocked(usePdfGeneration)
const getReportMock = vi.mocked(backendAPI.getReport)
const useManualReportHtmlRecoveryMock = vi.mocked(useManualReportHtmlRecovery)
const useManualReportMethodHydrationMock = vi.mocked(useManualReportMethodHydration)
const usePdfStalenessLifecycleMock = vi.mocked(usePdfStalenessLifecycle)

function makeReport(): ValuationReportData {
  return {
    id: 'rep_1',
    companyName: 'Test BV',
    ebitda: 100_000,
    generatedAt: new Date('2026-06-01T00:00:00Z'),
    valuation: 1_000_000,
    multiple: 5,
    metrics: [],
  }
}

function makeParams(
  overrides: Partial<UseManualReportReadinessControllerParams> = {}
): UseManualReportReadinessControllerParams {
  return {
    reportId: 'rep_1',
    resolvedReportId: 'rep_1',
    reportHydrationLookupId: 'rep_1',
    pdfStalePollLookupId: 'rep_1',
    firmCountryCode: 'BE',
    report: makeReport(),
    result: null,
    session: null as ValuationSession | null,
    standaloneHtmlReport: null,
    restorationComplete: true,
    isCalculating: false,
    isGenerating: false,
    canDownloadPdf: true,
    setResult: vi.fn(),
    setReport: vi.fn(),
    openStarterPaywall: vi.fn(),
    showRetryFailureToast: vi.fn(),
    translateToast: (key) => key,
    ...overrides,
  }
}

function getLatestStalenessParams(): UsePdfStalenessLifecycleParams {
  const latestCall = usePdfStalenessLifecycleMock.mock.calls.at(-1)
  if (!latestCall) {
    throw new Error('usePdfStalenessLifecycle was not called')
  }
  return latestCall[0]
}

describe('useManualReportReadinessController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePdfGenerationMock.mockReturnValue({
      state: { status: 'none', url: null, error: null, progress: 0 },
      generatePdf: vi.fn().mockResolvedValue(null),
      downloadPdf: vi.fn().mockResolvedValue(undefined),
      isReady: false,
      isGenerating: false,
    })
    useManualReportMethodHydrationMock.mockReturnValue({
      isHydratingEditModalData: false,
      reportMethodHydrationError: null,
      retryReportMethodHydration: vi.fn(),
      showFiscalReferenceForOmni: false,
    })
    useManualReportHtmlRecoveryMock.mockReturnValue({
      isRecoveringReportHtml: false,
      retryReportHtmlRecovery: vi.fn(),
    })
    usePdfStalenessLifecycleMock.mockReturnValue({
      pdfStale: false,
      pdfWaitTimedOut: false,
      pdfPollErrorCount: 0,
      pdfPollTransientCount: 0,
      isPdfRetrying: false,
      retry: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('passes a stable report fetcher into the PDF staleness lifecycle', async () => {
    const response = {
      valuation_id: 'rep_1',
      company_name: 'Test BV',
    } as ValuationResponse
    getReportMock.mockResolvedValue(response)

    const { rerender } = renderHook(
      (props: UseManualReportReadinessControllerParams) =>
        useManualReportReadinessController(props),
      { initialProps: makeParams() }
    )
    const firstFetcher = getLatestStalenessParams().getReport

    rerender(makeParams({ reportId: 'rep_2', resolvedReportId: 'rep_2' }))
    const secondFetcher = getLatestStalenessParams().getReport

    expect(secondFetcher).toBe(firstFetcher)
    await expect(firstFetcher('lookup-report', { bySession404Attempts: 2 })).resolves.toBe(response)
    expect(getReportMock).toHaveBeenCalledWith('lookup-report', { bySession404Attempts: 2 })
  })

  it('gates PDF work and changes its identity when saving or the report revision changes', async () => {
    const h = renderHook(
      (props: UseManualReportReadinessControllerParams) =>
        useManualReportReadinessController(props),
      { initialProps: makeParams({ upstreamBlocked: true }) }
    )
    expect(getLatestStalenessParams().persistedReportLookupId).toBeNull()
    await expect(h.result.current.generatePdf()).resolves.toBeNull()
    expect(usePdfGenerationMock.mock.results[0].value.generatePdf).not.toHaveBeenCalled()
    const blockedIdentity = usePdfGenerationMock.mock.calls.at(-1)?.[1]
    h.rerender(makeParams({ report: { ...makeReport(), renderFingerprint: 'acknowledged-v2' } }))
    expect(getLatestStalenessParams().persistedReportLookupId).toBe('rep_1')
    expect(usePdfGenerationMock.mock.calls.at(-1)?.[1]).not.toBe(blockedIdentity)
  })

  it('uses the resolved report id for PDF generation', () => {
    renderHook(() =>
      useManualReportReadinessController(
        makeParams({ reportId: 'session-key', resolvedReportId: 'uuid-report' })
      )
    )

    expect(usePdfGenerationMock).toHaveBeenCalledWith('uuid-report', expect.any(String))
  })
})
