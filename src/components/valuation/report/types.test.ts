import { describe, expect, it } from 'vitest'

import { convertApiResponseToReportData } from './types'

describe('convertApiResponseToReportData', () => {
  it('preserves DCF historical FCF readiness from api responses', () => {
    const report = convertApiResponseToReportData({
      valuation_id: 'val_123_test',
      company_name: 'DCF Ready BV',
      equity_value_mid: 410000,
      current_year_data: {
        revenue: 900000,
        ebitda: 120000,
      },
      multiples_valuation: {
        ebitda_multiple: 4.2,
      },
      selected_valuation_method: 'dcf',
      dcf_valuation: {
        historical_fcf_readiness: {
          status: 'partial',
          historical_years_count: 3,
          actual_capex_years: 2,
          actual_tax_years: 3,
          actual_nwc_years: 1,
        },
      },
    })

    expect(report.dcfHistoricalFcfReadiness).toMatchObject({
      status: 'partial',
      actual_capex_years: 2,
      actual_tax_years: 3,
    })
  })

  it('does not expose stale DCF historical FCF readiness for non-DCF single-method reports', () => {
    const report = convertApiResponseToReportData({
      valuation_id: 'val_123_test',
      company_name: 'EBITDA Multiple BV',
      selected_valuation_method: 'ebitda_multiple',
      equity_value_mid: 410000,
      current_year_data: {
        revenue: 900000,
        ebitda: 120000,
      },
      dcf_valuation: {
        historical_fcf_readiness: {
          status: 'partial',
          historical_years_count: 3,
          actual_capex_years: 2,
          actual_tax_years: 3,
          actual_nwc_years: 1,
        },
      },
    })

    expect(report.dcfHistoricalFcfReadiness).toBeUndefined()
  })

  it('keeps DCF historical FCF readiness for weighted synthesis reports', () => {
    const report = convertApiResponseToReportData({
      valuation_id: 'val_123_test',
      company_name: 'Hybrid BV',
      selected_valuation_method: 'ebitda_multiple',
      has_weighted_synthesis: true,
      equity_value_mid: 410000,
      current_year_data: {
        revenue: 900000,
        ebitda: 120000,
      },
      dcf_valuation: {
        historical_fcf_readiness: {
          status: 'partial',
          historical_years_count: 3,
          actual_capex_years: 2,
          actual_tax_years: 3,
          actual_nwc_years: 1,
        },
      },
    })

    expect(report.dcfHistoricalFcfReadiness).toMatchObject({
      status: 'partial',
      actual_capex_years: 2,
    })
  })

  it('retains zero and withholds a contradictory positive band', () => {
    const report = convertApiResponseToReportData({
      valuation_id: 'val_123_test',
      company_name: 'Range BV',
      equity_value_mid: 0,
      recommended_asking_price: 0,
      equity_value_low: 12_800_000,
      equity_value_high: 18_400_000,
    })

    expect(report.valuation).toBe(0)
    expect(report.valuationLow).toBeUndefined()
    expect(report.valuationHigh).toBeUndefined()
    expect(report.recommendedAskingPrice).toBe(0)
  })

  it('keeps absent and invalid monetary inputs unknown instead of producing zero', () => {
    const report = convertApiResponseToReportData({
      current_year_data: { ebitda: false, revenue: [1000] },
      multiples_valuation: { ebitda_multiple: '0x10' },
      ebitda_adjustments: [
        { id: 'bad', value: true },
        { id: 'zero', value: '0' },
      ],
    })
    expect(report.valuation).toBeNull()
    expect(report.ebitda).toBeNull()
    expect(report.multiple).toBeNull()
    expect(report.revenue).toBeUndefined()
    expect(report.currency).toBeUndefined()
    expect(report.ebitdaAdjustments).toEqual([expect.objectContaining({ id: 'zero', value: 0 })])
  })

  it('retains an enterprise conclusion without an equity band or asking price', () => {
    const report = convertApiResponseToReportData({
      value: '1200.25',
      value_basis: 'enterprise_value',
      currency: 'USD',
      equity_value_low: 1000,
      equity_value_high: 1300,
      recommended_asking_price: 1400,
    })
    expect(report.valuation).toBe(1200.25)
    expect(report.valueBasis).toBe('enterprise_value')
    expect(report.currency).toBe('USD')
    expect(report.valuationLow).toBeUndefined()
    expect(report.recommendedAskingPrice).toBeUndefined()
  })
})
