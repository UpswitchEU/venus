import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationSession } from '../../../types/valuation'
import { backendAPI } from '../../backendApi'
import { tryRefetchAfterEnsureHtml } from '../SessionHtmlRecovery'

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
