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
