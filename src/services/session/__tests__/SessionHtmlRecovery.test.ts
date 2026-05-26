import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ValuationSession } from '../../../types/valuation'
import { backendAPI } from '../../backendApi'
import {
  __resetEnsureHtmlStateForTests,
  tryRefetchAfterEnsureHtml,
} from '../SessionHtmlRecovery'

vi.mock('../../backendApi', () => ({
  backendAPI: {
    ensureReportHtml: vi.fn(),
    getValuationSession: vi.fn(),
  },
}))

function recoveryCandidate(reportId: string): ValuationSession {
  return {
    reportId,
    currentView: 'manual',
    dataSource: 'manual',
    sessionData: {},
    valuationResult: { equity_value_mid: 1_000_000 },
    htmlReport: '',
  } as unknown as ValuationSession
}

describe('tryRefetchAfterEnsureHtml', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetEnsureHtmlStateForTests()
    useSessionStore.getState().setRenderError(null)
  })

  it('does not refetch or hammer ensure-html after a failed recovery response', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const getValuationSession = vi.mocked(backendAPI.getValuationSession)
    const reportId = 'val_html_recovery_failed_1'
    const session = recoveryCandidate(reportId)

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'failed',
      reportId,
    })

    const first = await tryRefetchAfterEnsureHtml(reportId, session)
    const second = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(ensureReportHtml).toHaveBeenCalledTimes(1)
    expect(getValuationSession).not.toHaveBeenCalled()
  })

  it('marks payload_too_large as a permanent failure and stops retrying', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const getValuationSession = vi.mocked(backendAPI.getValuationSession)
    const reportId = 'val_html_recovery_payload_too_large_1'
    const session = recoveryCandidate(reportId)

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'payload_too_large',
      reportId,
    })

    const first = await tryRefetchAfterEnsureHtml(reportId, session)
    const second = await tryRefetchAfterEnsureHtml(reportId, session)
    const third = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(third).toBeNull()
    expect(ensureReportHtml).toHaveBeenCalledTimes(1)
    expect(getValuationSession).not.toHaveBeenCalled()
    // Verifies the UI is notified — Results.tsx subscribes to renderError and
    // swaps the generic "report not available" fallback for an actionable banner.
    expect(useSessionStore.getState().renderError).toBe('payload_too_large')
  })

  it('treats payload_too_large as permanent even when success:false flips on the response', async () => {
    // Defensive regression: a future Titan contract change could flip
    // `success` to false alongside status:'payload_too_large'. The recovery
    // path must check the terminal status BEFORE the generic success flag,
    // otherwise the call would downgrade to the 5-minute cooldown branch
    // and resume the loop after the cooldown expires.
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const reportId = 'val_html_recovery_payload_too_large_2'
    const session = recoveryCandidate(reportId)

    ensureReportHtml.mockResolvedValue({
      success: false,
      status: 'payload_too_large',
      reportId,
    })

    await tryRefetchAfterEnsureHtml(reportId, session)
    const second = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(second).toBeNull()
    // Both the permanent-failure marker and the store flag must be set,
    // even though success was false.
    expect(ensureReportHtml).toHaveBeenCalledTimes(1)
    expect(useSessionStore.getState().renderError).toBe('payload_too_large')
  })

  it('refetches after Titan reports recovered HTML', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const getValuationSession = vi.mocked(backendAPI.getValuationSession)
    const reportId = 'val_html_recovery_success_1'
    const session = recoveryCandidate(reportId)

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'recovered',
      reportId,
    })
    getValuationSession.mockResolvedValue({
      success: true,
      session,
    })

    const result = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(result?.session).toBe(session)
    expect(getValuationSession).toHaveBeenCalledWith(reportId)
  })
})
