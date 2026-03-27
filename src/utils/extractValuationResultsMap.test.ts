import { describe, expect, it } from 'vitest'

import { extractValuationResultsMap } from './extractValuationResultsMap'

describe('extractValuationResultsMap', () => {
  it('normalizes adaptive multiple from canonical report context', () => {
    const payload = {
      details: {
        valuation_results: {
          upswitch_adaptive: {
            available: true,
            value: 357000,
            multiple_used: 4.75,
            details: {},
          },
        },
      },
      report_context: {
        applied_multiple: 3.45,
        multiple_low: 2.59,
        multiple_high: 4.6,
      },
    }

    expect(extractValuationResultsMap(payload)).toMatchObject({
      upswitch_adaptive: {
        multiple_used: 3.45,
        details: {
          p25_multiple: 2.59,
          p75_multiple: 4.6,
        },
      },
    })
  })

  it('coerces string canonical multiples to numbers', () => {
    const payload = {
      details: {
        valuation_results: {
          upswitch_adaptive: { available: true, value: 357000, multiple_used: 4.75, details: {} },
        },
      },
      report_context: {
        applied_multiple: '3.45' as unknown as number,
        multiple_low: '2.59' as unknown as number,
        multiple_high: '4.6' as unknown as number,
      },
    };

    const out = extractValuationResultsMap(payload);
    expect(out?.upswitch_adaptive?.multiple_used).toBe(3.45);
    expect(out?.upswitch_adaptive?.details?.p25_multiple).toBe(2.59);
    expect(out?.upswitch_adaptive?.details?.p75_multiple).toBe(4.6);
  })

  it('enriches dcf method data with historical FCF readiness from dcf_valuation', () => {
    const payload = {
      valuation_results: {
        dcf: {
          available: true,
          value: 410000,
          label: 'DCF',
          details: {},
        },
      },
      dcf_valuation: {
        enterprise_value: 525000,
        wacc: 0.113,
        terminal_value: 310000,
        historical_fcf_readiness: {
          status: 'partial',
          historical_years_count: 3,
          actual_capex_years: 2,
          actual_tax_years: 3,
          actual_nwc_years: 1,
        },
      },
    }

    expect(extractValuationResultsMap(payload)).toMatchObject({
      dcf: {
        wacc: 0.113,
        details: {
          enterprise_value: 525000,
          terminal_value: 310000,
          historical_fcf_readiness: {
            status: 'partial',
            actual_capex_years: 2,
          },
        },
      },
    })
  })

  it('synthesizes from report_context when valuation_results paths are empty', () => {
    const payload = {
      valuation_results: {},
      details: { valuation_results: {} },
      report_context: {
        equity_value_mid: 500_000,
        applied_multiple: 4.2,
        multiple_low: 3.1,
        multiple_high: 5.4,
      },
    }
    const out = extractValuationResultsMap(payload, { selectedValuationMethod: 'upswitch_adaptive' })
    expect(out?.upswitch_adaptive?.value).toBe(500_000)
    expect(out?.upswitch_adaptive?.multiple_used).toBe(4.2)
  })

  it('marks synthesized revenue methods unavailable when payload revenue is zero', () => {
    const payload = {
      valuation_results: {},
      current_year_data: {
        revenue: 0,
      },
      report_context: {
        equity_value_mid: 120_000,
        applied_multiple: 1.2,
      },
    }
    const out = extractValuationResultsMap(payload, { selectedValuationMethod: 'omzet_multiple' })
    expect(out?.omzet_multiple).toMatchObject({
      available: false,
      value: null,
      label: 'Omzetmultiple',
      unavailable_reason: 'Omzet moet positief zijn.',
    })
  })

  it('does not synthesize adjusted_nav from generic headline equity alone', () => {
    const payload = {
      valuation_results: {},
      report_context: {
        equity_value_mid: 625_000,
        selected_valuation_method: 'adjusted_nav',
      },
    }

    expect(extractValuationResultsMap(payload)).toBeNull()
  })

  it('synthesizes adjusted_nav only when explicit asset-based evidence exists', () => {
    const payload = {
      valuation_results: {},
      report_context: {
        equity_value_mid: 625_000,
        selected_valuation_method: 'adjusted_nav',
      },
      asset_based_details: {
        asset_based_evidence: true,
        net_asset_value: 625_000,
        total_assets_adjusted: 900_000,
        total_liabilities_adjusted: 275_000,
      },
    }

    expect(extractValuationResultsMap(payload)).toMatchObject({
      adjusted_nav: {
        available: true,
        value: 625_000,
        details: {
          asset_based_evidence: true,
          net_asset_value: 625_000,
        },
      },
    })
  })

  it('does not synthesize from multiple alone', () => {
    expect(
      extractValuationResultsMap({
        valuation_results: {},
        report_context: { applied_multiple: 4.5 },
      }),
    ).toBeNull()
  })
})
