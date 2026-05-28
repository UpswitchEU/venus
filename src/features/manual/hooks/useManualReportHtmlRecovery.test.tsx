// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationSession } from '../../../types/valuation'
import { backendAPI } from '../../../services/backendApi'
import { __resetEnsureHtmlStateForTests } from '../../../services/session/SessionHtmlRecovery'
import { useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'
import { clearReportsDeleting } from '../utils/manualReportDeleteGuard'
import { recoverManualReportHtmlIfNeeded } from '../utils/manualReportHtmlRecoveryUtil'
import { useManualReportHtmlRecovery } from './useManualReportHtmlRecovery'

vi.mock('../../../services/backendApi', () => ({
  backendAPI: {
    ensureReportHtml: vi.fn(),
    getValuationSession: vi.fn(),
  },
}))

vi.mock('../utils/manualReportHtmlRecoveryUtil', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/manualReportHtmlRecoveryUtil')>()
  return {
    ...actual,
    recoverManualReportHtmlIfNeeded: vi.fn(actual.recoverManualReportHtmlIfNeeded),
  }
})

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
    useSessionStore.getState().clearSession()
    useSessionStore.getState().setRenderError(null)
    useManualResultsStore.getState().setResult(null)
    useManualResultsStore.getState().setHtmlReport('')
  })

  it('triggers ensure-html when session only has safety-net HTML', async () => {
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
      })
    )

    await waitFor(() => {
      expect(backendAPI.ensureReportHtml).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(useManualResultsStore.getState().result).toEqual(
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
      })
    )

    await waitFor(() => {
      expect(backendAPI.ensureReportHtml).not.toHaveBeenCalled()
    })
  })

  it('retries at the hook level after util recovery fails', async () => {
    vi.useFakeTimers()
    try {
      const reportId = 'val_recovery_hook_retry'
      const session = baseSession(reportId)
      const recoveredResult = {
        equity_value_mid: 750_000,
        html_report: '<main>Hook retry recovered</main>',
      }

      vi.mocked(recoverManualReportHtmlIfNeeded)
        .mockResolvedValueOnce({ status: 'failed' })
        .mockResolvedValueOnce({
          status: 'recovered',
          html: recoveredResult.html_report,
          result: recoveredResult as never,
        })

      renderHook(() =>
        useManualReportHtmlRecovery({
          reportId,
          session,
          result: null,
          restorationComplete: true,
          isCalculating: false,
          isGenerating: false,
        })
      )

      await vi.advanceTimersByTimeAsync(0)
      expect(recoverManualReportHtmlIfNeeded).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(5000)
      expect(recoverManualReportHtmlIfNeeded).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sets html_recovery_failed after all hook passes exhaust', async () => {
    vi.useFakeTimers()
    try {
      const reportId = 'val_recovery_hook_exhausted'
      const session = baseSession(reportId)

      vi.mocked(recoverManualReportHtmlIfNeeded).mockResolvedValue({ status: 'failed' })

      renderHook(() =>
        useManualReportHtmlRecovery({
          reportId,
          session,
          result: null,
          restorationComplete: true,
          isCalculating: false,
          isGenerating: false,
        })
      )

      for (const delay of [0, 5_000, 15_000, 45_000]) {
        await vi.advanceTimersByTimeAsync(delay)
        await Promise.resolve()
      }

      expect(useSessionStore.getState().renderError).toBe('html_recovery_failed')
      expect(recoverManualReportHtmlIfNeeded).toHaveBeenCalledTimes(4)
    } finally {
      vi.useRealTimers()
    }
  })
})
