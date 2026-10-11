import { describe, expect, it } from 'vitest'
import type { ValuationResponse } from '@/types/valuation'
import {
  mergePolledResultWithExisting,
  reportPatchFromFreshResponse,
} from './usePdfStalenessLifecycleReportPatch'

function valuationResponse(partial: Record<string, unknown>): ValuationResponse {
  return {
    valuation_id: 'val_pdf_patch',
    company_name: 'PDF Patch BV',
    equity_value_mid: 1_000_000,
    ...partial,
  } as unknown as ValuationResponse
}

describe('usePdfStalenessLifecycleReportPatch', () => {
  it.each([
    { valuation_id: 'val_pdf_patch', render_fingerprint: 'different' },
    { valuation_id: 'val_new_run', render_fingerprint: 'original' },
    { valuation_id: 'val_new_run' },
    { valuation_id: 'val_pdf_patch' },
  ])('does not carry prices or assets across incompatible snapshots: %j', (identity) => {
    const existing = valuationResponse({
      render_fingerprint: 'original',
      html_report: '<main>Old report</main>',
      fiscal_4x_anchor: { source: 'old' },
      multiple_adjustment_summary: { retained: true },
      recommended_asking_price: 1_200_000,
      pdf_url: 'https://example.test/old.pdf',
      pdf_coherent: true,
      valuation_results: { dcf: { available: true, value: 1_000_000 } },
    })
    const fresh = identity as ValuationResponse
    const merged = mergePolledResultWithExisting(fresh, existing)
    expect(merged.valuation_results).toBeUndefined()
    expect(merged.equity_value_mid).toBeUndefined()
    expect(merged.recommended_asking_price).toBeUndefined()
    expect(merged.fiscal_4x_anchor).toBeNull()
    expect(merged.multiple_adjustment_summary).toBeUndefined()
    expect(merged.html_report).toBeUndefined()
    expect(merged.pdf_url).toBeUndefined()
    expect(merged.pdf_coherent).not.toBe(true)
  })

  it('retains compatible legacy partial results without fingerprints', () => {
    const existing = valuationResponse({
      valuation_results: { dcf: { available: true, value: 1_000_000 } },
    })
    const merged = mergePolledResultWithExisting(
      { valuation_id: 'val_pdf_patch' } as ValuationResponse,
      existing
    )
    expect(merged.valuation_results?.dcf.value).toBe(1_000_000)
  })

  it('clears a previous asking price when the refreshed report has none', () => {
    const patch = reportPatchFromFreshResponse(valuationResponse({}), true, {
      selectedMethod: 'dcf',
      preSelectedMethods: [],
      userWeights: {},
    })
    expect(Object.hasOwn(patch, 'recommendedAskingPrice')).toBe(true)
    expect(patch.recommendedAskingPrice).toBeUndefined()
  })

  it('preserves existing renderable HTML when the polled response has no replacement', () => {
    const existing = valuationResponse({
      html_report: '<main>Existing full report</main>',
      render_fingerprint: 'render-fp-1',
      fiscal_4x_anchor: { source: 'existing' },
      multiple_adjustment_summary: { retained: true },
    })
    const fresh = valuationResponse({
      html_report: undefined,
      render_fingerprint: 'render-fp-1',
      fiscal_4x_anchor: null,
    })

    const merged = mergePolledResultWithExisting(fresh, existing)

    expect(merged.html_report).toBe('<main>Existing full report</main>')
    expect(merged.fiscal_4x_anchor).toEqual({ source: 'existing' })
    expect(merged.multiple_adjustment_summary).toEqual({ retained: true })
  })

  it('builds PDF metadata and synthesis-aware valuation patch from fresh report data', () => {
    const fresh = valuationResponse({
      updated_at: '2026-06-22T10:00:00.000Z',
      pdf_generated_at: '2026-06-22T10:01:00.000Z',
      pdf_url: 'https://example.test/report.pdf',
      render_fingerprint: 'render-fp-2',
      pdf_render_fingerprint: 'render-fp-2',
      pdf_coherent: true,
      weighted_valuation: {
        blended_equity_value: 567_771,
      },
      valuation_results: {
        ebitda_multiple: {
          available: true,
          value: 453_502,
          details: {
            equity_range_low: 400_000,
            equity_range_high: 500_000,
          },
        },
      },
    })

    const patch = reportPatchFromFreshResponse(fresh, true, {
      selectedMethod: 'ebitda_multiple',
      preSelectedMethods: ['upswitch_adaptive'],
      userWeights: {},
    })

    expect(patch.reportUpdatedAt).toEqual(new Date('2026-06-22T10:00:00.000Z'))
    expect(patch.pdfGeneratedAt).toEqual(new Date('2026-06-22T10:01:00.000Z'))
    expect(patch.pdfUrl).toBe('https://example.test/report.pdf')
    expect(patch.renderFingerprint).toBe('render-fp-2')
    expect(patch.pdfRenderFingerprint).toBe('render-fp-2')
    expect(patch.pdfCoherent).toBe(true)
    expect(patch.valuation).toBe(567_771)
    expect(patch.recommendedAskingPrice).toBe(567_771)
  })
})
