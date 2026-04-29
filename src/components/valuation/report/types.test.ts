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
})
