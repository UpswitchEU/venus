// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationSession } from '../../../types/valuation'
import {
  extractRenderableHtmlFromSession,
  resultMissingRenderableHtml,
  sessionNeedsRenderableHtmlFromPayload,
} from '../manualReportHtmlRecoveryCore'

const safetyNetHtml =
  '<section class="valuation-summary"><h3>Waardeschatting — samenvatting</h3></section>'

describe('manualReportHtmlRecoveryCore', () => {
  it('treats safety-net session HTML as needing recovery', () => {
    const session = {
      reportId: 'val_1',
      valuationResult: { equity_value_mid: 500_000, html_report: safetyNetHtml },
      htmlReport: safetyNetHtml,
    } as unknown as ValuationSession

    expect(extractRenderableHtmlFromSession(session)).toBeUndefined()
    expect(sessionNeedsRenderableHtmlFromPayload(session)).toBe(true)
  })

  it('does not need recovery when renderable HTML is present', () => {
    const session = {
      reportId: 'val_2',
      valuationResult: { equity_value_mid: 500_000, html_report: '<main>Report</main>' },
      htmlReport: '<main>Report</main>',
    } as unknown as ValuationSession

    expect(extractRenderableHtmlFromSession(session)).toBe('<main>Report</main>')
    expect(sessionNeedsRenderableHtmlFromPayload(session)).toBe(false)
  })

  it('detects missing HTML on result with valuation range', () => {
    expect(
      resultMissingRenderableHtml({
        equity_value_mid: 1,
        html_report: safetyNetHtml,
      } as never)
    ).toBe(true)
  })
})
