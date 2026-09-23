// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationResponse } from '@/types/valuation'
import { LAST_VALUATION_REQUEST_SESSION_KEY } from '@/utils/sessionPackageHelpers'
import { buildManualReportAssets, formKeysChangedSinceSubmit } from './manualReportAssets'

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

describe('formKeysChangedSinceSubmit', () => {
  it('is empty when the form did not change while the calculation ran', () => {
    const submitted = { company_name: 'Acme', current_year_data: { year: 2025, revenue: 100 } }
    expect(formKeysChangedSinceSubmit(submitted, submitted)).toEqual([])
    expect(
      formKeysChangedSinceSubmit(submitted, {
        company_name: 'Acme',
        current_year_data: { year: 2025, revenue: 100 },
      })
    ).toEqual([])
  })

  it('names edited, added and removed fields', () => {
    expect(
      formKeysChangedSinceSubmit(
        { company_name: 'Acme', current_year_data: { year: 2025, revenue: 100 }, city: 'Gent' },
        {
          company_name: 'Acme',
          current_year_data: { year: 2025, revenue: 150 },
          industry: 'retail',
        }
      ).sort()
    ).toEqual(['city', 'current_year_data', 'industry'])
  })
})

describe('buildManualReportAssets — inputs edited while calculating', () => {
  const request = {
    current_year_data: { year: 2025, revenue: 100, ebitda: 10 },
    historical_years_data: [{ year: 2024, revenue: 90, ebitda: 9 }],
    user_weights: { dcf: 0.4, ebitda_multiple: 0.6 },
  }

  it('leaves the edited fields and every request-derived input out of the save', () => {
    const assets = buildManualReportAssets({
      sessionData: {
        company_name: 'Acme',
        founding_year: 2001,
        current_year_data: { year: 2025, revenue: 100, ebitda: 10 },
        revenue: 100,
      },
      request,
      taxLatencyItems: [{ id: 'tax-1' }],
      valuationResult: result(),
      changedFormKeys: ['founding_year'],
    })

    // Titan merges this blob over the stored session: a key present here overwrites the
    // newer value the advisor typed while the engine was running.
    expect(assets.sessionData).not.toHaveProperty('founding_year')
    expect(assets.sessionData).not.toHaveProperty('current_year_data')
    expect(assets.sessionData).not.toHaveProperty('historical_years_data')
    expect(assets.sessionData).not.toHaveProperty('revenue')
    expect(assets.sessionData).not.toHaveProperty('user_weights')
    // Unchanged fields and the keys that belong to the result are still saved.
    expect(assets.sessionData).toMatchObject({
      company_name: 'Acme',
      _taxLatencies: [{ id: 'tax-1' }],
      [LAST_VALUATION_REQUEST_SESSION_KEY]: request,
    })
    expect(assets.valuationResult).toBeDefined()
    expect(assets.htmlReport).toBe('<main>real report</main>')
  })

  it('keeps the full canonical package when nothing changed', () => {
    const assets = buildManualReportAssets({
      sessionData: { company_name: 'Acme', revenue: 1 },
      request,
      taxLatencyItems: [],
      valuationResult: result(),
      changedFormKeys: [],
    })

    expect(assets.sessionData).toMatchObject({
      company_name: 'Acme',
      revenue: 100,
      current_year_data: request.current_year_data,
      user_weights: request.user_weights,
    })
  })
})
