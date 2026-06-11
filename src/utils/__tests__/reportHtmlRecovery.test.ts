import { describe, expect, it } from 'vitest'
import type { ValuationSession } from '../../../types/valuation'
import {
  clearHtmlFromMissingRestorationAssets,
  enrichRecoveryValuationSnapshot,
  mergeRecoveredHtmlIntoValuationSnapshot,
  preserveClientRecoveredHtmlWhenServerSessionStale,
  sessionNeedsRenderableHtmlRecovery,
  sessionPayloadNeedsRenderableHtmlRecovery,
  valuationSnapshotHasRange,
} from '../reportHtmlRecovery'

const safetyNetHtml =
  '<section class="valuation-summary"><h3>Waardeschatting — samenvatting</h3></section>'

describe('reportHtmlRecovery', () => {
  it('treats valuation_midpoint-only snapshots as eligible for HTML recovery', () => {
    expect(valuationSnapshotHasRange({ valuation_midpoint: 750_000 })).toBe(true)
    expect(valuationSnapshotHasRange({ details: { valuation_midpoint: 750_000 } })).toBe(true)
  })

  it('treats pricing_range-only snapshots as eligible for HTML recovery', () => {
    expect(
      valuationSnapshotHasRange({
        pricing_range: { min: 500_000, mid: 750_000, max: 1_000_000, currency: 'EUR' },
      })
    ).toBe(true)
  })

  it('enriches recovery snapshot from session pricing range when equity fields are absent', () => {
    const session = {
      reportId: 'val_pricing_only',
      sessionData: {
        _pricingRange: { min: 500_000, mid: 750_000, max: 1_000_000, currency: 'EUR' },
      },
      htmlReport: '',
    } as unknown as ValuationSession

    const enriched = enrichRecoveryValuationSnapshot(session, null)
    expect(enriched?.equity_value_mid).toBe(750_000)
    expect(
      sessionPayloadNeedsRenderableHtmlRecovery({ ...session, valuationResult: enriched })
    ).toBe(true)
  })

  it('repairs zero recovery midpoint from a positive valuation range', () => {
    const session = {
      reportId: 'val_zero_mid_recovery',
      valuationResult: {
        equity_value_low: 500_000,
        equity_value_mid: 0,
        equity_value_high: 1_000_000,
      },
      htmlReport: '',
    } as unknown as ValuationSession

    const enriched = enrichRecoveryValuationSnapshot(session, null)

    expect(enriched?.equity_value_mid).toBe(750_000)
  })

  it('merges recovered HTML into both top-level and details fields', () => {
    const merged = mergeRecoveredHtmlIntoValuationSnapshot(
      { valuation_id: 'v1', details: { overall_confidence: 'high' } },
      '<main>Recovered</main>'
    )

    expect(merged.html_report).toBe('<main>Recovered</main>')
    expect(merged.details?.html_report).toBe('<main>Recovered</main>')
    expect(merged.details?.overall_confidence).toBe('high')
  })

  it('still needs recovery when bootstrap only stored safety-net HTML in sessionData', () => {
    const session = {
      reportId: 'val_bootstrap_safety_net',
      sessionData: {
        _htmlReport: safetyNetHtml,
        _pricingRange: { min: 500_000, mid: 750_000, max: 1_000_000, currency: 'EUR' },
      },
      htmlReport: safetyNetHtml,
    } as unknown as ValuationSession

    expect(sessionNeedsRenderableHtmlRecovery(session)).toBe(true)
  })

  it('buildRecoveryEligibilitySession lifts pricing-only bootstrap payloads', () => {
    const session = {
      reportId: 'val_pricing_only',
      sessionData: {
        _pricingRange: { min: 500_000, mid: 750_000, max: 1_000_000, currency: 'EUR' },
      },
      htmlReport: '',
    } as unknown as ValuationSession

    const enriched = enrichRecoveryValuationSnapshot(session, null)
    expect(enriched?.equity_value_mid).toBe(750_000)
    expect(
      sessionPayloadNeedsRenderableHtmlRecovery({ ...session, valuationResult: enriched })
    ).toBe(true)
  })

  it('preserves client-recovered HTML when server session is still stale', () => {
    const recoveredHtml = '<main>Client recovered report</main>'
    const clientSession = {
      reportId: 'val_stale_server',
      reportReady: true,
      htmlReport: recoveredHtml,
      sessionData: { _htmlReport: recoveredHtml },
      valuationResult: { equity_value_mid: 750_000, html_report: recoveredHtml },
    } as unknown as ValuationSession
    const serverSession = {
      reportId: 'val_stale_server',
      reportReady: false,
      sessionData: {
        _missingRestorationAssets: ['html_report'],
        _pricingRange: { min: 500_000, mid: 750_000, max: 1_000_000, currency: 'EUR' },
      },
      valuationResult: { equity_value_mid: 750_000 },
    } as unknown as ValuationSession

    const merged = preserveClientRecoveredHtmlWhenServerSessionStale(serverSession, clientSession)

    expect(merged.htmlReport).toBe(recoveredHtml)
    expect(merged.reportReady).toBe(true)
    expect(merged.valuationResult?.html_report).toBe(recoveredHtml)
    expect(
      (merged.sessionData as { _missingRestorationAssets?: string[] })._missingRestorationAssets
    ).toBeUndefined()
  })

  it('preserves client-recovered HTML from results store when session snapshot is stale', () => {
    const recoveredHtml = '<main>Store recovered report</main>'
    const serverSession = {
      reportId: 'val_store_fallback',
      reportReady: false,
      sessionData: {
        _missingRestorationAssets: ['html_report'],
        _pricingRange: { min: 500_000, mid: 750_000, max: 1_000_000, currency: 'EUR' },
      },
      valuationResult: { equity_value_mid: 750_000 },
    } as unknown as ValuationSession

    const merged = preserveClientRecoveredHtmlWhenServerSessionStale(serverSession, null, {
      htmlReport: recoveredHtml,
      valuationResult: { equity_value_mid: 750_000 },
    })

    expect(merged.htmlReport).toBe(recoveredHtml)
    expect(merged.reportReady).toBe(true)
  })

  it('clears html_report from missing restoration assets after recovery', () => {
    expect(
      clearHtmlFromMissingRestorationAssets({
        _missingRestorationAssets: ['html_report', 'pricing_range'],
      })._missingRestorationAssets
    ).toEqual(['pricing_range'])
  })
})
