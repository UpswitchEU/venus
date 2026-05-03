import { describe, expect, it } from 'vitest'

import {
  extractValuationResultsMap,
  getValuationMethodResultForKey,
  hydratedRevenueMethodKeysAreSameRef,
  hydrateClientValuationResultsMap,
  isDuplicateHydratedRevenueAliasEntry,
  isRevenueMethodologyKey,
  normalizeSelectedMethodKey,
  normalizeValuationResultWithMethodMap,
  resolveSelectedValuationMethodForExtraction,
  revenueMethodologySiblingKey,
} from './extractValuationResultsMap'

describe('resolveSelectedValuationMethodForExtraction', () => {
  it('reads from report_context when top-level is missing', () => {
    expect(
      resolveSelectedValuationMethodForExtraction({
        report_context: { selected_valuation_method: 'dcf' },
      })
    ).toBe('dcf')
  })

  it('reads from details.report_context as last resort', () => {
    expect(
      resolveSelectedValuationMethodForExtraction({
        details: { report_context: { selected_valuation_method: '  ebitda_multiple  ' } },
      })
    ).toBe('ebitda_multiple')
  })

  it('prefers top-level over nested', () => {
    expect(
      resolveSelectedValuationMethodForExtraction({
        selected_valuation_method: 'omzet_multiple',
        report_context: { selected_valuation_method: 'dcf' },
      })
    ).toBe('omzet_multiple')
  })
})

describe('getValuationMethodResultForKey', () => {
  it('resolves omzet_multiple from revenue_multiple alias on the map', () => {
    const map = {
      revenue_multiple: { available: true, value: 99_000 },
    } as any
    expect(getValuationMethodResultForKey(map, 'omzet_multiple')?.value).toBe(99_000)
  })

  it('prefers the direct key when both aliases exist', () => {
    const map = {
      omzet_multiple: { available: true, value: 1 },
      revenue_multiple: { available: true, value: 2 },
    } as any
    expect(getValuationMethodResultForKey(map, 'omzet_multiple')?.value).toBe(1)
  })
})

describe('revenue methodology alias helpers', () => {
  it('isRevenueMethodologyKey', () => {
    expect(isRevenueMethodologyKey('omzet_multiple')).toBe(true)
    expect(isRevenueMethodologyKey('revenue_multiple')).toBe(true)
    expect(isRevenueMethodologyKey('ebitda_multiple')).toBe(false)
  })

  it('revenueMethodologySiblingKey', () => {
    expect(revenueMethodologySiblingKey('omzet_multiple')).toBe('revenue_multiple')
    expect(revenueMethodologySiblingKey('revenue_multiple')).toBe('omzet_multiple')
    expect(revenueMethodologySiblingKey('dcf')).toBeNull()
  })

  it('isDuplicateHydratedRevenueAliasEntry detects same-ref EN key', () => {
    const shared = { available: true, value: 1 } as any
    const base = { omzet_multiple: shared, revenue_multiple: shared } as any
    expect(isDuplicateHydratedRevenueAliasEntry(base, 'revenue_multiple', shared)).toBe(true)
    expect(isDuplicateHydratedRevenueAliasEntry(base, 'omzet_multiple', shared)).toBe(false)
  })

  it('hydratedRevenueMethodKeysAreSameRef', () => {
    const shared = { value: 1 } as any
    expect(
      hydratedRevenueMethodKeysAreSameRef({
        omzet_multiple: shared,
        revenue_multiple: shared,
      })
    ).toBe(true)
    expect(
      hydratedRevenueMethodKeysAreSameRef({
        omzet_multiple: { value: 1 },
        revenue_multiple: { value: 1 },
      })
    ).toBe(false)
  })
})

describe('normalizeSelectedMethodKey (DCF display labels)', () => {
  it('normalizes English DCF Analysis headline to the snake_case key persistence checks', () => {
    expect(normalizeSelectedMethodKey('DCF Analysis')).toBe('dcf_analysis')
  })

  it('normalizes long-form Discounted Cash Flow labels', () => {
    expect(normalizeSelectedMethodKey('Discounted Cash Flow')).toBe('discounted_cash_flow')
    expect(normalizeSelectedMethodKey('Discounted Cash Flow (DCF)')).toBe('discounted_cash_flow_(dcf)')
  })
})

describe('extractValuationResultsMap', () => {
  it('normalizes revenue_multiple aliases to canonical omzet_multiple', () => {
    expect(normalizeSelectedMethodKey(' revenue-multiple ')).toBe('omzet_multiple')
    expect(normalizeSelectedMethodKey('omzet_multiple')).toBe('omzet_multiple')
  })

  it('mirrors revenue aliases on extracted method maps', () => {
    const payload = {
      valuation_results: {
        revenue_multiple: {
          available: true,
          value: 120_000,
          label: 'Revenue Multiple',
        },
      },
    }
    const out = extractValuationResultsMap(payload)
    expect(out?.revenue_multiple?.value).toBe(120_000)
    expect(out?.omzet_multiple?.value).toBe(120_000)
  })

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

  it('enriches dcf with mid-year and academic disclosure from dcf_valuation', () => {
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
        mid_year_discounting: true,
        discount_periods_note: 't = 0.5, 1.5',
        academic_cost_of_equity_formula: 'Re = Rf + β × ERP',
      },
    }

    expect(extractValuationResultsMap(payload)).toMatchObject({
      dcf: {
        details: {
          mid_year_discounting: true,
          discount_periods_note: 't = 0.5, 1.5',
          academic_cost_of_equity_formula: 'Re = Rf + β × ERP',
        },
      },
    })
  })

  it('drops stale dcf entries when the selected method is a non-DCF single method', () => {
    const payload = {
      selected_valuation_method: 'ebitda_multiple',
      valuation_results: {
        ebitda_multiple: {
          available: true,
          value: 420000,
          label: 'EBITDA Multiple',
        },
        dcf: {
          available: true,
          value: 999999,
          label: 'Stale DCF',
          details: {},
        },
      },
      dcf_valuation: {
        enterprise_value: 999999,
        wacc: 0.123,
      },
    }

    const out = extractValuationResultsMap(payload, { selectedValuationMethod: 'ebitda_multiple' })

    expect(out?.ebitda_multiple?.value).toBe(420000)
    expect(out?.dcf).toBeUndefined()
  })

  it('keeps dcf entries for weighted synthesis payloads', () => {
    const payload = {
      selected_valuation_method: 'ebitda_multiple',
      has_weighted_synthesis: true,
      valuation_results: {
        ebitda_multiple: {
          available: true,
          value: 420000,
          label: 'EBITDA Multiple',
        },
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
      },
    }

    const out = extractValuationResultsMap(payload, { selectedValuationMethod: 'ebitda_multiple' })

    expect(out?.dcf).toMatchObject({
      value: 410000,
      wacc: 0.113,
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

  it('synthesizes canonical revenue method when context uses revenue alias', () => {
    const payload = {
      valuation_results: {},
      report_context: {
        equity_value_mid: 120_000,
        applied_multiple: 1.5,
        revenue: 500_000,
      },
    }
    expect(
      extractValuationResultsMap(payload, { selectedValuationMethod: ' revenue-multiple ' }),
    ).toMatchObject({
      omzet_multiple: {
        value: 120_000,
        multiple_used: 1.5,
      },
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

describe('hydrateClientValuationResultsMap', () => {
  it('matches extract with resolved selected + top-level selected_valuation_method', () => {
    const payload = {
      valuation_results: {},
      report_context: {
        equity_value_mid: 120_000,
        applied_multiple: 1.5,
        revenue: 500_000,
        selected_valuation_method: 'omzet_multiple',
      },
    }
    const viaHydrate = hydrateClientValuationResultsMap(payload)
    const viaExtract = extractValuationResultsMap(payload, {
      selectedValuationMethod:
        resolveSelectedValuationMethodForExtraction(payload) ?? payload.selected_valuation_method,
    })
    expect(viaHydrate).toEqual(viaExtract)
    expect(viaHydrate).toMatchObject({
      omzet_multiple: { value: 120_000, multiple_used: 1.5 },
    })
  })

  it('uses selectedValuationMethodOverride for synthesis context', () => {
    const payload = {
      valuation_results: {},
      report_context: {
        equity_value_mid: 120_000,
        applied_multiple: 1.5,
        ebitda: 50_000,
        revenue: 500_000,
      },
    }
    const revenue = hydrateClientValuationResultsMap({
      ...payload,
      selected_valuation_method: 'omzet_multiple',
    })
    const ebitdaForced = hydrateClientValuationResultsMap(
      { ...payload, selected_valuation_method: 'omzet_multiple' },
      { selectedValuationMethodOverride: 'ebitda_multiple' },
    )
    expect(revenue).toMatchObject({ omzet_multiple: expect.any(Object) })
    expect(ebitdaForced).toMatchObject({ ebitda_multiple: expect.any(Object) })
  })
})

describe('normalizeValuationResultWithMethodMap', () => {
  it('hoists from nested paths when top-level valuation_results is empty', () => {
    const input = {
      valuation_results: {},
      details: {
        valuation_results: {
          upswitch_adaptive: { available: true, value: 300 },
        },
      },
    }
    const out = normalizeValuationResultWithMethodMap(input)
    expect(out?.valuation_results).toMatchObject({
      upswitch_adaptive: { available: true, value: 300 },
    })
  })

  it('does not overwrite non-empty top-level valuation_results', () => {
    const input = {
      valuation_results: {
        upswitch_adaptive: { available: true, value: 1 },
      },
      details: {
        valuation_results: {
          upswitch_adaptive: { available: true, value: 999 },
        },
      },
    }
    const out = normalizeValuationResultWithMethodMap(input)
    expect(out?.valuation_results?.upswitch_adaptive?.value).toBe(1)
  })
})
