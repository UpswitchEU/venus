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

  it('does not mark client cooldown when ensure-html returns null (transient upstream error)', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const getValuationSession = vi.mocked(backendAPI.getValuationSession)
    const reportId = 'val_html_recovery_null_response'
    const session = recoveryCandidate(reportId)
    const inlineHtml = '<main>Recovered after null</main>'

    ensureReportHtml.mockResolvedValueOnce(null)
    ensureReportHtml.mockResolvedValueOnce({
      success: true,
      status: 'failed',
      reportId,
      html_report: inlineHtml,
    })

    const first = await tryRefetchAfterEnsureHtml(reportId, session)
    const second = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(first).toBeNull()
    expect(second?.session?.htmlReport).toBe(inlineHtml)
    expect(ensureReportHtml).toHaveBeenCalledTimes(2)
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

  it('triggers ensure-html when valuation_midpoint exists without equity fields', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const reportId = 'val_html_recovery_midpoint_only'
    const session = {
      reportId,
      currentView: 'manual',
      dataSource: 'manual',
      sessionData: {},
      valuationResult: { valuation_midpoint: 750_000 },
      htmlReport: '',
    } as unknown as ValuationSession
    const inlineHtml = '<main>Midpoint-only recovery</main>'

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'failed',
      reportId,
      html_report: inlineHtml,
    })

    const result = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(ensureReportHtml).toHaveBeenCalledOnce()
    expect(result?.session?.htmlReport).toBe(inlineHtml)
  })

  it('applies inline html from ensure-html when refetch still lacks renderable HTML', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const getValuationSession = vi.mocked(backendAPI.getValuationSession)
    const reportId = 'val_html_recovery_inline_fallback'
    const session = recoveryCandidate(reportId)
    const inlineHtml = '<main>Inline recovered full report</main>'

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'failed',
      reportId,
      html_report: inlineHtml,
    })
    getValuationSession.mockResolvedValue({
      success: true,
      session: {
        ...session,
        htmlReport: '',
        valuationResult: { equity_value_mid: 1_000_000 },
      },
    })

    const result = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(result?.session?.htmlReport).toBe(inlineHtml)
    expect(getValuationSession).not.toHaveBeenCalled()
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

  it('applies inline html after recovered ensure-html when session refetch is still empty', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const getValuationSession = vi.mocked(backendAPI.getValuationSession)
    const reportId = 'val_html_recovery_inline_after_refetch'
    const session = recoveryCandidate(reportId)
    const inlineHtml = '<main>Inline after refetch miss</main>'

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'recovered',
      reportId,
      html_report: inlineHtml,
    })
    getValuationSession.mockResolvedValue({
      success: true,
      session: {
        ...session,
        htmlReport: '',
        valuationResult: { equity_value_mid: 1_000_000 },
      },
    })

    const result = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(result?.session?.htmlReport).toBe(inlineHtml)
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

  it('allows bypassCooldown retries after a recent failure', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const reportId = 'val_html_recovery_bypass_cooldown'
    const session = recoveryCandidate(reportId)
    const inlineHtml = '<main>Bypass cooldown report</main>'

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'failed',
      reportId,
    })

    const first = await tryRefetchAfterEnsureHtml(reportId, session)
    const blocked = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(first).toBeNull()
    expect(blocked).toBeNull()
    expect(ensureReportHtml).toHaveBeenCalledTimes(1)

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'failed',
      reportId,
      html_report: inlineHtml,
    })

    const recovered = await tryRefetchAfterEnsureHtml(reportId, session, { bypassCooldown: true })

    expect(recovered?.session?.htmlReport).toBe(inlineHtml)
    expect(ensureReportHtml).toHaveBeenCalledTimes(2)
  })

  it('prefers html_report_view over html_report when both are renderable', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const reportId = 'val_html_recovery_viewer_overlay'
    const session = recoveryCandidate(reportId)
    const viewerHtml = '<main>Viewer overlay report</main>'

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'failed',
      reportId,
      html_report: '<main>Base report</main>',
      html_report_view: viewerHtml,
    })

    const result = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(result?.session?.htmlReport).toBe(viewerHtml)
    expect(ensureReportHtml).toHaveBeenCalledOnce()
  })

  it('treats sessionData html as recovered after refetch', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const getValuationSession = vi.mocked(backendAPI.getValuationSession)
    const reportId = 'val_html_recovery_session_data_html'
    const session = recoveryCandidate(reportId)
    const fullHtml = '<main>Full report in sessionData</main>'

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'recovered',
      reportId,
    })
    getValuationSession.mockResolvedValue({
      success: true,
      session: {
        ...session,
        htmlReport: '',
        valuationResult: { equity_value_mid: 1_000_000 },
        sessionData: { _htmlReport: fullHtml },
      },
    })

    const result = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(result?.session?.sessionData).toEqual(
      expect.objectContaining({ _htmlReport: fullHtml })
    )
    expect(getValuationSession).toHaveBeenCalledWith(reportId)
  })

  it('does not mark client cooldown when Titan returns skipped_recent_failure', async () => {
    const ensureReportHtml = vi.mocked(backendAPI.ensureReportHtml)
    const reportId = 'val_html_recovery_skipped_recent'
    const session = recoveryCandidate(reportId)

    ensureReportHtml.mockResolvedValue({
      success: true,
      status: 'skipped_recent_failure',
      reportId,
    })

    const first = await tryRefetchAfterEnsureHtml(reportId, session)
    const second = await tryRefetchAfterEnsureHtml(reportId, session)

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(ensureReportHtml).toHaveBeenCalledTimes(2)
  })
})
