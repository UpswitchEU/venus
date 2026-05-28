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

const safetyNetHtml =
  '<section class="valuation-summary"><h3>Waardeschatting — samenvatting</h3></section>'

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

  it('triggers ensure-html when only ValuationIQ safety-net HTML is present', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const getValuationSession = vi.mocked(backendAPI.getValuationSession)
    const reportId = 'val_html_recovery_safety_net_only'
    const session = {
      ...recoveryCandidate(reportId),
      htmlReport: safetyNetHtml,
      valuationResult: {
        equity_value_mid: 1_000_000,
        html_report: safetyNetHtml,
      },
    } as unknown as ValuationSession

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'recovered',
      reportId,
    })
    getValuationSession.mockResolvedValue({
      success: true,
      session: {
        ...session,
        htmlReport: '<main>Full report body</main>',
      },
    })

    await tryRefetchAfterEnsureHtml(reportId, session)

    expect(ensureReportHtml).toHaveBeenCalledOnce()
  })

  it('does not treat refetched safety-net-only session as recovered', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const getValuationSession = vi.mocked(backendAPI.getValuationSession)
    const reportId = 'val_html_recovery_still_safety_net'
    const session = recoveryCandidate(reportId)

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'recovered',
      reportId,
    })
    getValuationSession.mockResolvedValue({
      success: true,
      session: {
        ...session,
        htmlReport: safetyNetHtml,
        valuationResult: { equity_value_mid: 1_000_000, html_report: safetyNetHtml },
      },
    })

    const result = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(result).toBeNull()
    expect(getValuationSession).toHaveBeenCalled()
  })

  it('coalesces concurrent ensure-html calls for the same report (Strict Mode safe)', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const getValuationSession = vi.mocked(backendAPI.getValuationSession)
    const reportId = 'val_html_recovery_coalesced'
    const session = recoveryCandidate(reportId)

    let resolveEnsure!: (value: Awaited<ReturnType<typeof backendAPI.ensureReportHtml>>) => void
    ensureReportHtml.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnsure = resolve
        })
    )
    getValuationSession.mockResolvedValue({
      success: true,
      session: {
        ...session,
        htmlReport: '<main>Coalesced report</main>',
        valuationResult: {
          equity_value_mid: 1_000_000,
          html_report: '<main>Coalesced report</main>',
        },
      },
    })

    const first = tryRefetchAfterEnsureHtml(reportId, session)
    const second = tryRefetchAfterEnsureHtml(reportId, session)

    resolveEnsure!({
      success: true,
      status: 'recovered',
      reportId,
    })

    const [a, b] = await Promise.all([first, second])

    expect(a?.session?.htmlReport).toContain('Coalesced report')
    expect(b?.session?.htmlReport).toContain('Coalesced report')
    expect(ensureReportHtml).toHaveBeenCalledTimes(1)
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
      session: {
        ...session,
        htmlReport: '<main>Recovered full report</main>',
        valuationResult: {
          equity_value_mid: 1_000_000,
          html_report: '<main>Recovered full report</main>',
        },
      },
    })

    const result = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(result?.session?.htmlReport).toContain('Recovered full report')
    expect(getValuationSession).toHaveBeenCalledWith(reportId)
  })
})
