// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '@/types/valuation'
import { mapClarityFormToVenusStore } from './manualFormMapper'

function storeForm(overrides: Partial<ValuationFormData> = {}): ValuationFormData {
  return {
    company_name: 'Stored Co',
    country_code: 'NL',
    industry: 'services',
    business_model: 'b2b_saas',
    founding_year: 2001,
    ...overrides,
  }
}

describe('mapClarityFormToVenusStore', () => {
  it('preserves store business model and country when partial panel payload omits them', () => {
    const mapped = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        industry: 'technology',
        yearFounded: '2020',
        ownerManagers: 2,
      },
      storeForm()
    )

    expect(mapped).toMatchObject({
      company_name: 'Acme',
      country_code: 'NL',
      industry: 'technology',
      business_model: 'b2b_saas',
      founding_year: 2020,
      number_of_owners: 2,
    })
  })

  it('maps latest historical year to current year, older complete years to history, and forecasts to forecast rows', () => {
    const mapped = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        yearlyFinancials: [
          { year: '2023', revenue: 80, ebitda: 8 },
          { year: '2024', revenue: 90, ebitda: 9 },
          { year: '2026', revenue: 120, ebitda: 12, capex: 4, isForecast: true },
        ],
      },
      storeForm()
    )

    expect(mapped.revenue).toBe(90)
    expect(mapped.ebitda).toBe(9)
    expect(mapped.current_year_data).toMatchObject({ year: 2024, revenue: 90, ebitda: 9 })
    expect(mapped.historical_years_data).toEqual([{ year: 2023, revenue: 80, ebitda: 8 }])
    expect(mapped.forecast_years_data).toEqual([
      { year: 2026, revenue: 120, ebitda: 12, capex: 4, is_forecast: true },
    ])
  })

  it('keeps canonical NACE separate from display activity code', () => {
    const mapped = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        kboNumber: '0123.456.789',
        legalForm: 'BV',
        canonicalNaceCode: '62010',
        naceCode: '62.010',
        naceDescription: 'Software',
      },
      storeForm()
    )

    expect(mapped).toMatchObject({
      kbo_number: '0123.456.789',
      legal_form: 'BV',
      nace_code: '62010',
      nace_description: 'Software',
      activity_code: '62.010',
    })
  })

  it('only forwards usable official financial trust payloads', () => {
    const emptyTrust = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        official_financials: { source: 'nbb' },
        official_variance_analysis: { state: 'explained' },
      },
      storeForm()
    )
    expect(emptyTrust.official_financials).toBeUndefined()
    expect(emptyTrust.official_variance_analysis).toBeUndefined()

    const usableTrust = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        official_financials: { source: 'nbb', filingYear: 2024 },
        official_variance_analysis: { state: 'explained' },
      },
      storeForm()
    )
    expect(usableTrust.official_financials).toEqual({ source: 'nbb', filingYear: 2024 })
    expect(usableTrust.official_variance_analysis).toEqual({ state: 'explained' })
  })

  it('preserves method-specific valuation fields', () => {
    const mapped = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        dcf_wacc_pct: 12,
        dcf_terminal_value_method: 'exit_multiple',
        nav_other_revaluations: 25_000,
        saas_customer_concentration_pct: 30,
        owner_salary_addback: 80_000,
      },
      storeForm()
    )

    expect(mapped).toMatchObject({
      dcf_wacc_pct: 12,
      dcf_terminal_value_method: 'exit_multiple',
      nav_other_revaluations: 25_000,
      saas_customer_concentration_pct: 30,
      owner_salary_addback: 80_000,
    })
  })
})
