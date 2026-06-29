import { describe, expect, it } from 'vitest'
import type { ManualValuationFormData } from '../../../types/valuation'
import { buildManualInputSubmitPayload } from './manualInputSubmitPayload'

function makeForm(overrides: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'Acme BV',
    businessType: 'software',
    industry: 'technology',
    country: 'BE',
    ownerManagers: 1,
    yearlyFinancials: [{ year: '2024', revenue: 100, ebitda: 20 }],
    ...overrides,
  } as ManualValuationFormData
}

describe('buildManualInputSubmitPayload', () => {
  it('adds normalized EBITDA and trusted official financial fields when usable', () => {
    const payload = buildManualInputSubmitPayload({
      averageNormalizedEbitda: 123,
      formData: makeForm(),
      trustFormData: {
        official_financials: { filingYear: 2024, revenue: 100 },
        official_variance_analysis: {
          state: 'explained',
          explanationRequired: false,
        },
        official_verification_badge: {
          state: 'verified',
          label: 'Verified',
        },
      },
    })

    expect(payload.averageNormalizedEbitda).toBe(123)
    expect(payload.official_financials).toMatchObject({ filingYear: 2024, revenue: 100 })
    expect(payload.official_variance_analysis).toMatchObject({ state: 'explained' })
    expect(payload.official_verification_badge).toMatchObject({ state: 'verified' })
  })

  it('does not leak empty official trust stubs into the submit payload', () => {
    const payload = buildManualInputSubmitPayload({
      averageNormalizedEbitda: 123,
      formData: makeForm(),
      trustFormData: {
        official_financials: {
          dataHealth: { state: 'error' },
        },
        official_variance_analysis: {
          state: 'pending',
          explanationRequired: true,
        },
        official_verification_badge: {
          state: 'unavailable',
          label: 'Unavailable',
        },
      },
    })

    expect(payload.official_financials).toBeUndefined()
    expect(payload.official_variance_analysis).toBeUndefined()
    expect(payload.official_verification_badge).toBeUndefined()
  })

  it('rewrites stale forecast_years_data from the repaired forecast grid', () => {
    const payload = buildManualInputSubmitPayload({
      averageNormalizedEbitda: 100_000,
      formData: makeForm({
        yearlyFinancials: [
          { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
          { year: '2026', revenue: 1_050_000, ebitda: 105_000, isForecast: true },
        ],
        forecast_years_data: [{ year: 2026, revenue: 105_000, ebitda: 0 }],
      }),
      trustFormData: {},
    })

    expect(payload.forecast_years_data).toEqual([
      { year: 2026, revenue: 1_050_000, ebitda: 105_000, is_forecast: true },
    ])
  })
})
