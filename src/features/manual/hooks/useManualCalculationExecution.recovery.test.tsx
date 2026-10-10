import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { valuationService } from '../../../services'
import { useReportRecoveryStore } from '../../../store/reportRecoveryStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { persistNormalizationsBeforeCalculate } from '../../../utils/normalizationPersist'
import { useManualCalculationExecution } from './useManualCalculationExecution'

vi.mock('../../../services', () => ({ valuationService: { calculateValuation: vi.fn() } }))
vi.mock('../../../utils/normalizationPersist', () => ({
  persistNormalizationsBeforeCalculate: vi.fn(),
}))
const failure = {
  kind: 'temporary' as const,
  status: 503,
  message: 'Unable to verify your firm subscription',
}
const request = {
  company_name: 'Imported company',
  current_year_data: {
    year: 2025,
    revenue: 12484755.94,
    ebitda: 2625090.27,
    ebitda_normalization_metadata: { reported_ebitda: 2399239.12 },
  },
  historical_years_data: [{ year: 2024, revenue: 11000000, ebitda: 2000000 }],
}
beforeEach(() => {
  vi.clearAllMocks()
  useReportRecoveryStore.setState({ step: null })
  useSessionStore.setState({
    updateSessionData: vi.fn().mockResolvedValue(undefined),
    saveSession: vi.fn().mockResolvedValue({ status: 'acknowledged' }),
    saveFailure: null,
  })
  useNormalizationStore.setState({ pendingMutations: [] })
  vi.mocked(persistNormalizationsBeforeCalculate).mockResolvedValue(true)
  vi.mocked(valuationService.calculateValuation).mockResolvedValue({
    valuation_id: 'one-calculation',
  } as never)
})
describe('Silverfin → manual overrides → adjustments → regenerate', () => {
  it.each([
    'session',
    'normalizations',
  ])('stops before calculation when %s persistence fails', async (stage) => {
    if (stage === 'session')
      useSessionStore.setState({
        saveSession: vi.fn().mockResolvedValue({ status: 'deferred', failure }),
        saveFailure: failure,
      })
    else vi.mocked(persistNormalizationsBeforeCalculate).mockResolvedValue(false)
    const h = renderHook(() => useManualCalculationExecution({ translate: (key) => key }))
    const endLoading = vi.fn()
    let outcome: unknown
    await act(async () => {
      outcome = await h.result.current.runManualCalculationExecution({
        idForApi: 'report-123',
        request: request as never,
        retrySubmit: vi.fn(),
        submitRun: { isStillTarget: () => true, endLoading } as never,
      })
    })
    expect(outcome).toMatchObject({ aborted: true })
    expect(valuationService.calculateValuation).not.toHaveBeenCalled()
    expect(endLoading).toHaveBeenCalled()
    expect(useReportRecoveryStore.getState().step?.stage).toBe('inputs')
  })
  it('retains a calculation rejected by the subscription preflight without treating it as saved', async () => {
    vi.mocked(valuationService.calculateValuation).mockRejectedValueOnce({
      status: 503,
      code: 'ADVISORY_VERIFICATION_UNAVAILABLE',
    })
    const h = renderHook(() => useManualCalculationExecution({ translate: (key) => key }))
    await act(async () => {
      const result = await h.result.current.runManualCalculationExecution({
        idForApi: 'report-123',
        request: request as never,
        retrySubmit: vi.fn(),
        submitRun: { isStillTarget: () => true, endLoading: vi.fn() } as never,
      })
      expect(result.aborted).toBe(true)
    })
    expect(useSessionStore.getState().saveFailure?.kind).toBe('temporary')
    expect(useReportRecoveryStore.getState().step?.stage).toBe('inputs')
  })
  it('uses the edited multi-year figures only after both prerequisites acknowledge', async () => {
    const h = renderHook(() => useManualCalculationExecution({ translate: (key) => key }))
    await act(async () => {
      await h.result.current.runManualCalculationExecution({
        idForApi: 'report-123',
        request: request as never,
        retrySubmit: vi.fn(),
        submitRun: { isStillTarget: () => true, endLoading: vi.fn() } as never,
      })
    })
    expect(valuationService.calculateValuation).toHaveBeenCalledExactlyOnceWith(request)
    expect(persistNormalizationsBeforeCalculate).toHaveBeenCalledWith('report-123', request)
  })
})
