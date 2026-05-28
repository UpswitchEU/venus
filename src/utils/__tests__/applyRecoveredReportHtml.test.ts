// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'
import type { ValuationSession } from '../../types/valuation'
import { useManualResultsStore } from '../../store/manual'
import { useSessionStore } from '../../store/useSessionStore'
import { SessionRestorationService } from '../../services/session/SessionRestorationService'
import { applyRecoveredReportHtml } from '../applyRecoveredReportHtml'

const safetyNetHtml =
  '<section class="valuation-summary"><h3>Waardeschatting — samenvatting</h3></section>'
const recoveredHtml = '<main>Recovered full report</main>'

describe('applyRecoveredReportHtml', () => {
  beforeEach(() => {
    useSessionStore.getState().clearSession()
    useManualResultsStore.getState().setResult(null)
    useManualResultsStore.getState().setHtmlReport('')
    SessionRestorationService.clearRestorationState('val_apply_recovered_1')
  })

  it('hydrates session, results store, cache, and sessionData html fields', () => {
    const reportId = 'val_apply_recovered_1'
    const recoverySession = {
      reportId,
      sessionData: {
        _htmlReport: safetyNetHtml,
        _pricingRange: { min: 500_000, mid: 750_000, max: 1_000_000, currency: 'EUR' },
      },
      valuationResult: { equity_value_mid: 750_000, html_report: safetyNetHtml },
      htmlReport: safetyNetHtml,
    } as unknown as ValuationSession

    useSessionStore.getState().hydrateSession({
      ...recoverySession,
      reportReady: false,
      sessionData: {
        ...recoverySession.sessionData,
        _missingRestorationAssets: ['html_report', 'pricing_range'],
      },
    })

    const mergedResult = applyRecoveredReportHtml({
      reportId,
      recoverySession,
      refetchedSession: recoverySession,
      baseResult: { equity_value_mid: 750_000, valuation_id: reportId },
      recoveredHtml,
    })

    expect(mergedResult.html_report).toBe(recoveredHtml)
    expect(mergedResult.details?.html_report).toBe(recoveredHtml)
    expect(useManualResultsStore.getState().result?.html_report).toBe(recoveredHtml)
    expect(useSessionStore.getState().session?.htmlReport).toBe(recoveredHtml)
    expect(
      (useSessionStore.getState().session?.sessionData as { _htmlReport?: string } | undefined)
        ?._htmlReport
    ).toBe(recoveredHtml)
    expect(useSessionStore.getState().renderError).toBeNull()
    expect(useSessionStore.getState().session?.reportReady).toBe(true)
    expect(
      (
        useSessionStore.getState().session?.sessionData as
          | { _missingRestorationAssets?: string[] }
          | undefined
      )?._missingRestorationAssets
    ).toEqual(['pricing_range'])
    expect(SessionRestorationService.canSkipRestoration(reportId)).toBe(true)
  })
})
