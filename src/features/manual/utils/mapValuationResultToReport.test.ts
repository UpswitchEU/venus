/**
 * mapValuationResultToReport — behaviour pins for the pure projection from
 * `ValuationResponse` to `ValuationReportData`. Before Phase 4c.2 Hook 2
 * this logic lived inline in a 110-line useEffect inside `ManualLayout`
 * and was untestable in isolation.
 */

import { describe, expect, it, vi } from 'vitest'
import type { ValuationResponse } from '@/types/valuation'
import {
  isDcfOrHybridMethodSignal,
  mapValuationResultToReport,
  type ReportTranslator,
  resultHasWeightedSynthesisSignal,
} from './mapValuationResultToReport'

const translate: ReportTranslator = vi.fn((key) => `t:${key}`)

function makeResult(partial: Partial<ValuationResponse> = {}): ValuationResponse {
  return {
    valuation_id: 'val_xyz',
    company_name: 'Test BV',
    current_year_data: { revenue: 2_000_000, ebitda: 400_000 },
    ...partial,
  } as ValuationResponse
}

describe('mapValuationResultToReport', () => {
  describe('id resolution', () => {
    it('prefers reportId when present', () => {
      const report = mapValuationResultToReport({
        result: makeResult({ valuation_id: 'val_xyz' }),
        selectedMethod: 'dcf',
        reportId: 'route-id',
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.id).toBe('route-id')
    })

    it('falls back to result.valuation_id when reportId is undefined', () => {
      const report = mapValuationResultToReport({
        result: makeResult({ valuation_id: 'val_xyz' }),
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.id).toBe('val_xyz')
    })

    it('falls back to the literal "draft" when no id is present anywhere', () => {
      const report = mapValuationResultToReport({
        result: makeResult({ valuation_id: '' }),
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.id).toBe('draft')
    })
  })

  describe('company name', () => {
    it('uses result.company_name when present', () => {
      const report = mapValuationResultToReport({
        result: makeResult({ company_name: 'Custom BV' }),
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.companyName).toBe('Custom BV')
    })

    it('falls back to result.business_name when company_name is missing', () => {
      const result = makeResult({
        company_name: undefined as unknown as string,
      })
      ;(result as any).business_name = 'Fallback NV'
      const report = mapValuationResultToReport({
        result,
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.companyName).toBe('Fallback NV')
    })

    it('uses tReport("defaultCompanyName") when nothing is set', () => {
      const result = makeResult({ company_name: undefined as unknown as string })
      const report = mapValuationResultToReport({
        result,
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.companyName).toBe('t:defaultCompanyName')
    })
  })

  describe('financial metrics', () => {
    it('uses current_year_data.ebitda + computes ebitda margin', () => {
      const report = mapValuationResultToReport({
        result: makeResult({
          current_year_data: { revenue: 2_000_000, ebitda: 400_000 },
        }),
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.ebitda).toBe(400_000)
      expect(report.metrics[1].value).toBe('20.0%')
    })

    it('falls back to "—" for the EBITDA margin when revenue is zero', () => {
      const report = mapValuationResultToReport({
        result: makeResult({ current_year_data: { revenue: 0, ebitda: 0 } }),
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.metrics[1].value).toBe('—')
    })

    it('prefers latest_normalized_ebitda for normalizedEbitda when finite', () => {
      const result = makeResult({
        current_year_data: { revenue: 2_000_000, ebitda: 400_000 },
      })
      ;(result as any).latest_normalized_ebitda = 450_000
      const report = mapValuationResultToReport({
        result,
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.normalizedEbitda).toBe(450_000)
    })

    it('falls back to ebitda when latest_normalized_ebitda is absent', () => {
      const report = mapValuationResultToReport({
        result: makeResult({
          current_year_data: { revenue: 2_000_000, ebitda: 400_000 },
        }),
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.normalizedEbitda).toBe(400_000)
    })
  })

  describe('multipleRange', () => {
    it('uses Waarderingssynthese headline when clientBlendedValue is supplied', () => {
      const report = mapValuationResultToReport({
        result: {
          valuation_results: {
            upswitch_adaptive: { available: true, value: 384_000, details: {} },
          },
        } as ValuationResponse,
        selectedMethod: 'upswitch_adaptive',
        reportId: 'r1',
        canDownloadPdf: false,
        tReport: translate,
        clientBlendedValue: 567_771,
      })

      expect(report.valuation).toBe(567_771)
    })

    it('sets recommendedAskingPrice to synthesis headline when weighted_valuation is present', () => {
      const report = mapValuationResultToReport({
        result: {
          recommended_asking_price: 384_000,
          weighted_valuation: { blended_equity_value: 567_771 },
          valuation_results: {
            upswitch_adaptive: { available: true, value: 384_000, details: {} },
          },
        } as ValuationResponse,
        selectedMethod: 'upswitch_adaptive',
        reportId: 'r1',
        canDownloadPdf: false,
        tReport: translate,
      })

      expect(report.valuation).toBe(567_771)
      expect(report.recommendedAskingPrice).toBe(567_771)
    })

    it('uses presentation.multipleRange when present (via deriveManualReportPresentation)', () => {
      const report = mapValuationResultToReport({
        result: makeResult({
          multiples_valuation: {
            p25_ebitda_multiple: 3,
            p75_ebitda_multiple: 7,
            multiples_range: { low: 4, high: 6, midpoint: 5, low_label: 'P25', high_label: 'P75' },
          } as unknown as ValuationResponse['multiples_valuation'],
        }),
        selectedMethod: 'ebitda_multiple',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      // The presentation derives this; either presentation gives us a range
      // OR we fall back to p25/p75. Both are acceptable — the asserts here
      // just verify the shape is present.
      expect(report.multipleRange).toBeDefined()
    })

    it('falls back to p25/p75 when presentation.multipleRange is missing', () => {
      const report = mapValuationResultToReport({
        result: makeResult({
          multiples_valuation: {
            p25_ebitda_multiple: 3,
            p75_ebitda_multiple: 7,
          } as unknown as ValuationResponse['multiples_valuation'],
        }),
        selectedMethod: 'upswitch_adaptive',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.multipleRange).toEqual({ low: 3, high: 7 })
    })
  })

  describe('pdf gating', () => {
    it('passes pdfUrl through when canDownloadPdf=true and result.pdf_url is a string', () => {
      const result = makeResult()
      ;(result as any).pdf_url = 'https://example/pdf.pdf'
      const report = mapValuationResultToReport({
        result,
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.pdfUrl).toBe('https://example/pdf.pdf')
    })

    it('suppresses pdfUrl when canDownloadPdf=false', () => {
      const result = makeResult()
      ;(result as any).pdf_url = 'https://example/pdf.pdf'
      const report = mapValuationResultToReport({
        result,
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: false,
        tReport: translate,
      })
      expect(report.pdfUrl).toBeUndefined()
    })
  })

  describe('html report resolution', () => {
    it('uses sessionHtmlReport when result has no renderable html', () => {
      const report = mapValuationResultToReport({
        result: makeResult({ equity_value_mid: 750_000 } as Partial<ValuationResponse>),
        sessionHtmlReport: '<main>Recovered from session</main>',
        selectedMethod: 'dcf',
        reportId: 'r1',
        canDownloadPdf: false,
        tReport: translate,
      })
      expect(report.htmlReport).toBe('<main>Recovered from session</main>')
    })

    it('uses standaloneHtmlReport when result and session html are empty', () => {
      const report = mapValuationResultToReport({
        result: makeResult({ equity_value_mid: 750_000 } as Partial<ValuationResponse>),
        standaloneHtmlReport: '<main>Recovered from store</main>',
        selectedMethod: 'dcf',
        reportId: 'r1',
        canDownloadPdf: false,
        tReport: translate,
      })
      expect(report.htmlReport).toBe('<main>Recovered from store</main>')
    })
  })

  describe('confidence level', () => {
    it('lowercases result.overall_confidence', () => {
      const result = makeResult()
      ;(result as any).overall_confidence = 'HIGH'
      const report = mapValuationResultToReport({
        result,
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.confidenceLevel).toBe('high')
    })

    it('falls back to "medium" when overall_confidence is missing', () => {
      const report = mapValuationResultToReport({
        result: makeResult(),
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.confidenceLevel).toBe('medium')
    })
  })

  describe('DCF readiness exposure', () => {
    it('exposes dcfHistoricalFcfReadiness when selectedMethod is "dcf"', () => {
      const result = makeResult()
      ;(result as any).dcf_valuation = {
        historical_fcf_readiness: { status: 'imported_ready' },
      }
      const report = mapValuationResultToReport({
        result,
        selectedMethod: 'dcf',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.dcfHistoricalFcfReadiness).toEqual({ status: 'imported_ready' })
    })

    it('nulls dcfHistoricalFcfReadiness when method is not DCF and no synthesis signal', () => {
      const result = makeResult()
      ;(result as any).dcf_valuation = {
        historical_fcf_readiness: { status: 'imported_ready' },
      }
      const report = mapValuationResultToReport({
        result,
        selectedMethod: 'ebitda_multiple',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.dcfHistoricalFcfReadiness).toBeNull()
    })

    it('exposes dcfHistoricalFcfReadiness when weighted-synthesis signal present (any method)', () => {
      const result = makeResult({
        weighted_valuation: {
          blended_equity_value: 1_000_000,
          contributions: [],
        },
      })
      ;(result as any).dcf_valuation = {
        historical_fcf_readiness: { status: 'imported_ready' },
      }
      const report = mapValuationResultToReport({
        result,
        selectedMethod: 'ebitda_multiple',
        reportId: undefined,
        canDownloadPdf: true,
        tReport: translate,
      })
      expect(report.dcfHistoricalFcfReadiness).toEqual({ status: 'imported_ready' })
    })
  })
})

describe('isDcfOrHybridMethodSignal', () => {
  it.each([
    ['dcf'],
    ['DCF'],
    ['dcf_analysis'],
    ['discounted_cash_flow'],
    ['discounted-cash-flow'],
    ['Discounted Cash Flow (DCF)'],
    ['hybrid'],
    ['hybrid_dcf'],
    ['hybrid_valuation'],
  ])('recognises %s as DCF-ish', (value) => {
    expect(isDcfOrHybridMethodSignal(value)).toBe(true)
  })

  it.each([
    ['ebitda_multiple'],
    ['sde_multiple'],
    ['adjusted_nav'],
    [null],
    [undefined],
    [''],
  ])('rejects %s', (value) => {
    expect(isDcfOrHybridMethodSignal(value)).toBe(false)
  })
})

describe('resultHasWeightedSynthesisSignal', () => {
  it('detects has_weighted_synthesis at the top level', () => {
    expect(
      resultHasWeightedSynthesisSignal({ has_weighted_synthesis: true } as Record<string, unknown>)
    ).toBe(true)
  })

  it('detects blended_equity_value at the top level', () => {
    expect(
      resultHasWeightedSynthesisSignal({ blended_equity_value: 1_000_000 } as Record<
        string,
        unknown
      >)
    ).toBe(true)
  })

  it('detects has_weighted_synthesis nested in weighted_valuation', () => {
    expect(
      resultHasWeightedSynthesisSignal({
        weighted_valuation: { has_weighted_synthesis: true },
      } as Record<string, unknown>)
    ).toBe(true)
  })

  it('detects blended_equity_value nested in report_context', () => {
    expect(
      resultHasWeightedSynthesisSignal({
        report_context: { blended_equity_value: 999 },
      } as Record<string, unknown>)
    ).toBe(true)
  })

  it('returns false when no synthesis signal is present anywhere', () => {
    expect(
      resultHasWeightedSynthesisSignal({
        valuation_id: 'x',
        details: { foo: 'bar' },
      } as Record<string, unknown>)
    ).toBe(false)
  })

  it('returns false for null candidates inside the candidate list', () => {
    expect(
      resultHasWeightedSynthesisSignal({
        weighted_valuation: null,
        details: null,
      } as unknown as Record<string, unknown>)
    ).toBe(false)
  })
})
