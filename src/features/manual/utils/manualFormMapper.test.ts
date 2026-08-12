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

  it('strips stale FCFF from mapped forecast rows in default EBITDA mode', () => {
    const mapped = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        yearlyFinancials: [
          { year: '2024', revenue: 90, ebitda: 9 },
          {
            year: '2026',
            revenue: 120,
            ebitda: 12,
            free_cash_flow: 1,
            isForecast: true,
          },
        ],
      },
      storeForm()
    )

    expect(mapped.forecast_years_data).toEqual([
      { year: 2026, revenue: 120, ebitda: 12, is_forecast: true },
    ])
  })

  it('preserves mapped FCFF forecast rows in explicit FCFF-only mode', () => {
    const mapped = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        dcf_input_mode: 'fcff_only',
        yearlyFinancials: [
          { year: '2024', revenue: 90, ebitda: 9 },
          {
            year: '2026',
            revenue: 0,
            ebitda: 0,
            free_cash_flow: 75_000,
            isForecast: true,
          },
        ],
      },
      storeForm()
    )

    expect(mapped.dcf_input_mode).toBe('fcff_only')
    expect(mapped.forecast_years_data).toEqual([
      { year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000, is_forecast: true },
    ])
  })

  it('ignores newer zero placeholders when selecting the current valuation year', () => {
    const mapped = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        current_year_data: { year: 2025, revenue: 0, ebitda: 0, total_debt: 999 },
        yearlyFinancials: [
          { year: '2025', revenue: 0, ebitda: 0 },
          { year: '2024', revenue: 900_000, ebitda: 90_000 },
          { year: '2023', revenue: 800_000, ebitda: 80_000 },
        ],
      },
      storeForm()
    )

    expect(mapped).toMatchObject({
      revenue: 900_000,
      ebitda: 90_000,
      current_year_data: { year: 2024, revenue: 900_000, ebitda: 90_000 },
      historical_years_data: [{ year: 2023, revenue: 800_000, ebitda: 80_000 }],
    })
    expect(mapped.current_year_data).not.toHaveProperty('total_debt')
  })

  it('preserves existing current-year data when the panel only carries zero placeholders', () => {
    const mapped = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        current_year_data: { year: 2024, revenue: 900_000, ebitda: 90_000, total_debt: 25_000 },
        yearlyFinancials: [
          { year: '2025', revenue: 0, ebitda: 0 },
          { year: '2024', revenue: 0, ebitda: 0 },
          { year: '2023', revenue: 0, ebitda: 0 },
        ],
      },
      storeForm()
    )

    expect(mapped.current_year_data).toMatchObject({
      year: 2024,
      revenue: 900_000,
      ebitda: 90_000,
      total_debt: 25_000,
    })
    expect(mapped.historical_years_data).toEqual([])
  })

  it('maps one-year operating companies without manufacturing historical zero placeholders', () => {
    const mapped = mapClarityFormToVenusStore(
      {
        companyName: 'Upswitch',
        country: 'BE',
        industry: 'Financial Services',
        businessModel: 'Fintech - Lending & Credit',
        businessType: 'fintech-lending-credit',
        kboNumber: '1033.441.760',
        legalForm: 'Besloten Vennootschap',
        ownerManagers: 1,
        fteEmployees: 5,
        yearlyFinancials: [
          { year: '2025', revenue: 1_000_000, ebitda: 100_000 },
          { year: '2024', revenue: 0, ebitda: 0 },
          { year: '2023', revenue: 0, ebitda: 0 },
        ],
      },
      storeForm()
    )

    expect(mapped).toMatchObject({
      company_name: 'Upswitch',
      country_code: 'BE',
      industry: 'Financial Services',
      business_model: 'Fintech - Lending & Credit',
      business_type_id: 'fintech-lending',
      kbo_number: '1033.441.760',
      legal_form: 'Besloten Vennootschap',
      number_of_owners: 1,
      number_of_employees: 5,
      revenue: 1_000_000,
      ebitda: 100_000,
      current_year_data: { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
      historical_years_data: [],
    })
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
    const advancedMethodInputs = {
      nav_real_estate_book_value: 650_000,
      nav_real_estate_appraisal_value: 900_000,
      nav_per_asset_tax_rates: { real_estate: 25, inventory: 20 },
      nav_equipment_revaluation: {
        original_cost: 200_000,
        acquisition_year: 2020,
        tax_book_value: 40_000,
        economic_useful_life_years: 10,
      },
      deal_type: 'compare',
      deal_goodwill_amount: 175_000,
      deal_seller_share_basis: 300_000,
      deal_seller_is_individual: true,
      deal_buyer_discount_rate_pct: 9,
      deal_registration_duty_pct: 12.5,
      rev_capitalized_rd_amount: 85_000,
      liq_headcount: 8,
      liq_monthly_rent: 5_000,
      liq_paid_up_capital: 150_000,
      liq_deferred_tax: 25_000,
      liq_premise_override: 'orderly_liquidation',
      liq_realised_capital_gains: 40_000,
      liq_taxable_reserves: 30_000,
      liq_runway_months_orderly: 9,
      liq_runway_months_forced: 3,
      liq_distress_wacc_orderly: 18,
      liq_distress_wacc_forced: 30,
      liq_intangibles_uplift_pct: 5,
      liq_multiples_value_override: 425_000,
      liq_lb_super_preferent_employees: 10_000,
      liq_lb_preferent_tax: 20_000,
      liq_lb_preferent_other: 30_000,
      liq_lb_secured: 40_000,
      liq_lb_unsecured: 50_000,
      liq_lb_subordinated: 60_000,
      liq_lb_estate_costs: 70_000,
      liq_ao_land: 80_000,
      liq_ao_buildings: 90_000,
      liq_ao_machinery_equipment: 100_000,
      liq_ao_vehicles: 110_000,
      liq_ao_it_equipment: 120_000,
      liq_ao_intangibles: 130_000,
      liq_ao_inventory_raw: 140_000,
      liq_ao_inventory_wip: 150_000,
      liq_ao_inventory_finished: 160_000,
      liq_ao_trade_receivables: 170_000,
      liq_ao_other_receivables: 180_000,
      liq_ao_cash: 190_000,
      fiscal_acquisition_cost: 750_000,
      fiscal_anchor_2_value: 800_000,
      fiscal_anchor_3_value: 825_000,
      fiscal_anchor_4_value: 0,
    } as const
    const mapped = mapClarityFormToVenusStore(
      {
        companyName: 'Acme',
        currency: 'gbp',
        dcf_wacc_pct: 12,
        dcf_discounting_convention: 'year_end',
        dcf_tax_shield_projections: [1.5, 1.125, 0.75],
        dcf_terminal_value_method: 'exit_multiple',
        nav_other_revaluations: 25_000,
        saas_customer_concentration_pct: 30,
        effective_multiple_override: 6,
        effective_multiple_override_note: 'Strategic buyer premium',
        multiple_type_weights: { ev_ebitda: 50, ev_revenue: 40, pe: 10 },
        advisor_discount_weights: { size_discount: 0.5, liquidity_discount: 1.25 },
        risk_analysis_enabled: false,
        discount_floor_factor: 0.4,
        owner_salary_addback: 80_000,
        ...advancedMethodInputs,
      },
      storeForm()
    )

    expect(mapped).toMatchObject({
      dcf_wacc_pct: 12,
      dcf_discounting_convention: 'year_end',
      dcf_tax_shield_projections: [1.5, 1.125, 0.75],
      dcf_terminal_value_method: 'exit_multiple',
      nav_other_revaluations: 25_000,
      saas_customer_concentration_pct: 30,
      effective_multiple_override: 6,
      effective_multiple_override_note: 'Strategic buyer premium',
      multiple_type_weights: { ev_ebitda: 50, ev_revenue: 40, pe: 10 },
      advisor_discount_weights: { size_discount: 0.5, liquidity_discount: 1.25 },
      risk_analysis_enabled: false,
      discount_floor_factor: 0.4,
      owner_salary_addback: 80_000,
      currency: 'GBP',
    })
    expect(mapped).toMatchObject(advancedMethodInputs)
  })
})
