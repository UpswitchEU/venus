// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '@/types/valuation'
import {
  buildValuationBusinessContext,
  isExplicitUserDcfIntent,
  normalizeDcfTaxShieldProjections,
  resolveDcfTerminalAssumptions,
} from './valuationRequestBusinessContext'

describe('isExplicitUserDcfIntent', () => {
  it('returns true when user_weights include DCF', () => {
    expect(
      isExplicitUserDcfIntent(
        {},
        { user_weights: { dcf: 70, ebitda_multiple: 30 } } as ValuationFormData,
        0
      )
    ).toBe(true)
  })

  it('returns false for auto-seeded WACC alone', () => {
    expect(isExplicitUserDcfIntent({ dcf_wacc_pct: 10.5 }, {} as ValuationFormData, 0)).toBe(false)
  })

  it('returns true for FCFF-only mode', () => {
    expect(
      isExplicitUserDcfIntent({ dcf_input_mode: 'fcff_only' }, {} as ValuationFormData, 0)
    ).toBe(true)
  })

  it('returns true when session JSONB pre-selected methods include DCF', () => {
    expect(
      isExplicitUserDcfIntent(
        {},
        {
          _pre_selected_valuation_methods: ['ebitda_multiple', 'dcf'],
        } as ValuationFormData,
        0
      )
    ).toBe(true)
  })
})

describe('resolveDcfTerminalAssumptions', () => {
  it('omits a stale non-DCF WACC placeholder instead of blocking the request', () => {
    expect(resolveDcfTerminalAssumptions({ dcf_wacc_pct: 0 })).toEqual({
      method: 'perpetual_growth',
      terminalGrowthPct: undefined,
      exitMultiple: undefined,
      hasTerminalInput: false,
    })
  })

  it('rejects non-positive WACC when DCF terminal assumptions are present', () => {
    expect(() =>
      resolveDcfTerminalAssumptions({
        dcf_wacc_pct: 0,
        dcf_terminal_growth_pct: 2,
      })
    ).toThrow('DCF WACC must be greater than 0%')
  })

  it('rejects perpetual-growth terminal assumptions when terminal growth is not below WACC', () => {
    expect(() =>
      resolveDcfTerminalAssumptions({
        dcf_wacc_pct: 9,
        dcf_terminal_growth_pct: 9,
      })
    ).toThrow('Terminal growth must be lower than WACC')
  })

  it('forces perpetual growth for FCFF-only mode even when an exit multiple is restored', () => {
    expect(
      resolveDcfTerminalAssumptions({
        dcf_input_mode: 'fcff_only',
        dcf_wacc_pct: '10,5',
        dcf_terminal_growth_pct: '2,25',
        dcf_exit_multiple: '7,0',
        dcf_terminal_value_method: 'exit_multiple',
      })
    ).toEqual({
      method: 'perpetual_growth',
      waccPct: 10.5,
      terminalGrowthPct: 2.25,
      hasTerminalInput: true,
    })
  })

  it('uses exit multiple only for exit-multiple terminal value', () => {
    expect(
      resolveDcfTerminalAssumptions({
        dcf_terminal_value_method: 'exit_multiple',
        dcf_wacc_pct: 11,
        dcf_terminal_growth_pct: 4,
        dcf_exit_multiple: 6.5,
      })
    ).toEqual({
      method: 'exit_multiple',
      waccPct: 11,
      exitMultiple: 6.5,
      hasTerminalInput: true,
    })
  })
})

describe('normalizeDcfTaxShieldProjections', () => {
  it('preserves yearly positions while aligning to the forecast horizon', () => {
    expect(
      normalizeDcfTaxShieldProjections(
        [1500, 'bad', null, '750', 999],
        [
          { year: 2026, revenue: 1, ebitda: 1 },
          { year: 2027, revenue: 1, ebitda: 1 },
          { year: 2028, revenue: 1, ebitda: 1 },
          { year: 2029, revenue: 1, ebitda: 1 },
        ]
      )
    ).toEqual([1500, 0, 0, 750])
  })

  it('pads missing forecast-year projections with zero and omits all-zero arrays', () => {
    expect(
      normalizeDcfTaxShieldProjections(
        [125],
        [
          { year: 2026, revenue: 1, ebitda: 1 },
          { year: 2027, revenue: 1, ebitda: 1 },
          { year: 2028, revenue: 1, ebitda: 1 },
        ]
      )
    ).toEqual([125, 0, 0])

    expect(
      normalizeDcfTaxShieldProjections([0, null, 'bad'], [{ year: 2026, revenue: 1, ebitda: 1 }])
    ).toEqual([])
  })

  it('uses the computed projection horizon when no explicit forecast rows exist', () => {
    expect(normalizeDcfTaxShieldProjections([125, 75], [], 5)).toEqual([125, 75, 0, 0, 0])
  })
})

describe('buildValuationBusinessContext forward driver evidence', () => {
  it('tags advisor DCF assumptions and forecast rows as forward drivers only', () => {
    const { businessContext } = buildValuationBusinessContext({
      formData: {
        selected_method: 'dcf',
        dcf_input_mode: 'fcff_only',
        dcf_discounting_convention: 'year_end',
        dcf_wacc_pct: 9,
        dcf_risk_free_rate_pct: 3,
        dcf_equity_risk_premium_pct: 5.5,
        dcf_beta: 1.1,
        dcf_cost_of_debt_pct: 4.5,
        dcf_debt_equity_pct: 30,
        dcf_tax_shield_pct: 25,
        dcf_terminal_growth_pct: 2,
        forecast_years_data: [{ year: 2027, revenue: 1_100_000, ebitda: 140_000 }],
      } as ValuationFormData,
      latestRevenue: undefined,
      countryCode: 'BE',
      rawForecastData: [{ year: 2027, revenue: 1_100_000, ebitda: 140_000 }],
      projectionYears: 5,
    })

    const evidence = businessContext?.forward_driver_evidence as Record<string, unknown>
    const assumptions = evidence.dcf_assumptions as Array<Record<string, unknown>>
    const rows = evidence.forecast_driver_rows as Array<Record<string, unknown>>

    expect(assumptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_key: 'dcf_wacc_pct',
          driver_group: 'wacc',
          source_kind: 'advisor_entered',
          use_kind: 'current_report_input',
          confidence: 'high',
          value: 9,
        }),
        expect.objectContaining({
          field_key: 'dcf_debt_equity_pct',
          driver_group: 'wacc',
          value: 30,
        }),
        expect.objectContaining({
          field_key: 'terminal_value_assumption',
          source_kind: 'advisor_entered',
        }),
        expect.objectContaining({
          field_key: 'dcf_input_mode',
          driver_group: 'dcf_input_mode',
          value: 'fcff_only',
        }),
        expect.objectContaining({
          field_key: 'dcf_discounting_convention',
          driver_group: 'dcf_discounting_convention',
          value: 'year_end',
        }),
      ])
    )
    expect(rows[0]).toMatchObject({
      fiscal_year: 2027,
      use_kind: 'forward_driver_input',
      source_kind: 'advisor_entered',
      warnings: ['forecast_driver_row_not_forward_valuation_point'],
    })
    expect(rows[0].drivers).toMatchObject({
      forecast_revenue: 1_100_000,
      forecast_ebitda: 140_000,
    })
    expect(businessContext?.forward_value_cone).toBeUndefined()
  })

  it('marks auto-seeded DCF placeholders as system fallbacks below forward threshold', () => {
    const { businessContext, userConfiguredDcf } = buildValuationBusinessContext({
      formData: { dcf_wacc_pct: 10.5 } as ValuationFormData,
      latestRevenue: undefined,
      countryCode: 'BE',
      rawForecastData: [],
      projectionYears: 5,
    })

    const evidence = businessContext?.forward_driver_evidence as Record<string, unknown>
    const assumptions = evidence.dcf_assumptions as Array<Record<string, unknown>>

    expect(userConfiguredDcf).toBe(false)
    expect(assumptions[0]).toMatchObject({
      field_key: 'dcf_wacc_pct',
      driver_group: 'wacc',
      source_kind: 'system_fallback',
      confidence: 'low',
      fallback: true,
      warnings: ['system_fallback_not_forward_defensible'],
    })
  })
})
