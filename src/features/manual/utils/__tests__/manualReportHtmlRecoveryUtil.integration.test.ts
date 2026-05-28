// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationSession } from '../../../../types/valuation'
import { backendAPI } from '../../../../services/backendApi'
import { __resetEnsureHtmlStateForTests } from '../../../../services/session/SessionHtmlRecovery'
import { useSessionStore } from '../../../../store/useSessionStore'
import { recoverManualReportHtmlIfNeeded } from '../manualReportHtmlRecoveryUtil'

vi.mock('../../../../services/backendApi', () => ({
  backendAPI: {
    ensureReportHtml: vi.fn(),
    getValuationSession: vi.fn(),
  },
}))

const safetyNetHtml =
  '<section class="valuation-summary"><h3>Waardeschatting — samenvatting</h3></section>'

describe('recoverManualReportHtmlIfNeeded (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetEnsureHtmlStateForTests()
    useSessionStore.getState().clearSession()
  })

  it('recovers renderable HTML after ensure-html when result is null', async () => {
    const reportId = 'val_recovery_util_1'
    const session = {
      reportId,
      valuationResult: { equity_value_mid: 750_000, html_report: safetyNetHtml },
      htmlReport: safetyNetHtml,
    } as unknown as ValuationSession

    vi.mocked(backendAPI.ensureReportHtml).mockResolvedValue({
      success: true,
      status: 'recovered',
      reportId,
    })
    vi.mocked(backendAPI.getValuationSession).mockResolvedValue({
      session: {
        ...session,
        htmlReport: '<main>Recovered report</main>',
        valuationResult: {
          equity_value_mid: 750_000,
          html_report: '<main>Recovered report</main>',
        },
      },
    } as never)

    const out = await recoverManualReportHtmlIfNeeded({ reportId, session, result: null })

    expect(out.status).toBe('recovered')
    expect(out.result?.html_report).toBe('<main>Recovered report</main>')
    expect(backendAPI.ensureReportHtml).toHaveBeenCalled()
    expect(useSessionStore.getState().session?.htmlReport).toBe('<main>Recovered report</main>')
    expect(
      (useSessionStore.getState().session?.valuationResult as { html_report?: string } | undefined)
        ?.html_report
    ).toBe('<main>Recovered report</main>')
    expect(useSessionStore.getState().renderError).toBeNull()
  })
})
