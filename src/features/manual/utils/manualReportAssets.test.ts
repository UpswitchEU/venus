// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationResponse } from '@/types/valuation'
import { LAST_VALUATION_REQUEST_SESSION_KEY } from '@/utils/sessionPackageHelpers'
import { buildManualReportAssets } from './manualReportAssets'

function result(html = '<main>real report</main>'): ValuationResponse {
  return {
    success: true,
    html_report: html,
  } as ValuationResponse
}

describe('buildManualReportAssets', () => {
  it('packages session data, request, tax latencies, valuation result, renderable HTML, and name', () => {
    const request = {
      company_name: 'Acme',
      current_year_data: { year: 2025, revenue: 100, ebitda: 10 },
      user_weights: { dcf: 0.4, ebitda_multiple: 0.6 },
    }
    const taxLatencyItems = [{ id: 'tax-1' }]

    const assets = buildManualReportAssets({
      sessionData: { company_name: 'Draft name', revenue: 1 },
      request,
      taxLatencyItems,
      valuationResult: result(),
      name: 'Acme valuation',
    })

    expect(assets.valuationResult).toBeDefined()
    expect(assets.htmlReport).toBe('<main>real report</main>')
    expect(assets.name).toBe('Acme valuation')
    expect(assets.sessionData).toMatchObject({
      company_name: 'Draft name',
      revenue: 100,
      ebitda: 10,
      user_weights: { dcf: 0.4, ebitda_multiple: 0.6 },
      _taxLatencies: taxLatencyItems,
      [LAST_VALUATION_REQUEST_SESSION_KEY]: request,
    })
  })

  it('omits safety-net HTML and blank names', () => {
    const assets = buildManualReportAssets({
      sessionData: {},
      request: {},
      taxLatencyItems: [],
      valuationResult: result('<section class="valuation-summary">Fallback</section>'),
      name: '',
    })

    expect(assets.htmlReport).toBeUndefined()
    expect(assets.name).toBeUndefined()
  })

  it('uses the explicit html override when provided', () => {
    const assets = buildManualReportAssets({
      sessionData: {},
      request: {},
      taxLatencyItems: [],
      valuationResult: result('<main>stale html</main>'),
      htmlReport: '<main>fresh html</main>',
    })

    expect(assets.htmlReport).toBe('<main>fresh html</main>')
  })
})
