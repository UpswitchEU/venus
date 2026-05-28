// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationSession } from '../../../types/valuation'
import { backendAPI } from '../../../services/backendApi'
import { __resetEnsureHtmlStateForTests } from '../../../services/session/SessionHtmlRecovery'
import { clearReportsDeleting } from '../utils/manualReportDeleteGuard'
import { useManualReportHtmlRecovery } from './useManualReportHtmlRecovery'

vi.mock('../../../services/backendApi', () => ({
  backendAPI: {
    ensureReportHtml: vi.fn(),
    getValuationSession: vi.fn(),
  },
}))

const safetyNetHtml =
  '<section class="valuation-summary"><h3>Waardeschatting — samenvatting</h3></section>'

function baseSession(reportId: string): ValuationSession {
  return {
    reportId,
    currentView: 'manual',
    dataSource: 'manual',
    sessionData: {},
    valuationResult: { equity_value_mid: 750_000, html_report: safetyNetHtml },
    htmlReport: safetyNetHtml,
  } as unknown as ValuationSession
}

describe('useManualReportHtmlRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearReportsDeleting()
    __resetEnsureHtmlStateForTests()
  })

  it('triggers ensure-html when session only has safety-net HTML', async () => {
    const setResult = vi.fn()
    const reportId = 'val_recovery_hook_1'
    vi.mocked(backendAPI.ensureReportHtml).mockResolvedValue({
      success: true,
      status: 'recovered',
      reportId,
    })
    vi.mocked(backendAPI.getValuationSession).mockResolvedValue({
      success: true,
      session: {
        ...baseSession(reportId),
        htmlReport: '<main>Recovered report</main>',
        valuationResult: {
          equity_value_mid: 750_000,
          html_report: '<main>Recovered report</main>',
        },
      },
    })

    renderHook(() =>
      useManualReportHtmlRecovery({
        reportId,
        session: baseSession(reportId),
        result: null,
        restorationComplete: true,
        isCalculating: false,
        isGenerating: false,
        setResult,
      })
    )

    await waitFor(() => {
      expect(backendAPI.ensureReportHtml).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(setResult).toHaveBeenCalledWith(
        expect.objectContaining({ html_report: '<main>Recovered report</main>' })
      )
    })
  })

  it('does not run while calculation is in flight', async () => {
    renderHook(() =>
      useManualReportHtmlRecovery({
        reportId: 'val_recovery_hook_2',
        session: baseSession('val_recovery_hook_2'),
        result: null,
        restorationComplete: true,
        isCalculating: true,
        isGenerating: false,
        setResult: vi.fn(),
      })
    )

    await waitFor(() => {
      expect(backendAPI.ensureReportHtml).not.toHaveBeenCalled()
    })
  })
})
