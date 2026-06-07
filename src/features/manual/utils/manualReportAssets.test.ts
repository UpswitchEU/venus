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

function resultWithMetadata(): ValuationResponse {
  return {
    success: true,
    html_report: '<main>real report</main>',
    metadata: { existing: true },
  } as unknown as ValuationResponse
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

  it('embeds discussion phase metadata in session data and valuation result metadata', () => {
    const discussionPhase = {
      version: 1,
      flow: 'manual',
      completed_at: '2026-06-07T10:00:00.000Z',
      discussion_completed_at: '2026-06-07T10:00:00.000Z',
      skipped: false,
      discussion_skipped: false,
      agenda: [],
      acknowledged: [],
      warnings_acknowledged: [],
      item_count: 0,
      high_severity_count: 0,
      acknowledgement_required_count: 0,
    } as const

    const assets = buildManualReportAssets({
      sessionData: { company_name: 'Acme', metadata: { retained: 'yes' } },
      request: { current_year_data: { revenue: 100, ebitda: 20 } },
      taxLatencyItems: [],
      valuationResult: resultWithMetadata(),
      discussionPhase,
    })

    expect(assets.sessionData.metadata).toEqual({
      retained: 'yes',
      discussion_phase: discussionPhase,
    })
    expect((assets.valuationResult as unknown as Record<string, unknown>).metadata).toEqual({
      existing: true,
      discussion_phase: discussionPhase,
    })
  })

  it('uses the explicit html override when persisting after discussion', () => {
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
