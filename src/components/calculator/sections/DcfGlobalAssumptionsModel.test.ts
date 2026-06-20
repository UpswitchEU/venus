import { describe, expect, it } from 'vitest'
import { buildDcfGlobalAssumptionsSeedPatch } from './DcfGlobalAssumptionsModel'

describe('DcfGlobalAssumptionsModel', () => {
  it('seeds forecast defaults only in the forecast block', () => {
    const patch = buildDcfGlobalAssumptionsSeedPatch({
      variant: 'forecastDefaultsOnly',
      dcfInputMode: 'ebitda',
      terminalValueMethod: 'perpetual_growth',
      currentValues: {},
      smartDefaults: {
        revenueGrowthPct: 12,
        ebitdaMarginPct: 22,
        capexPct: 4.4,
        daPct: 3.3,
        nwcPct: 1.2,
        taxRatePct: 25,
        waccPct: 11,
        terminalGrowthPct: 2.5,
      },
    })

    expect(patch).toEqual({
      dcf_revenue_growth_pct: 12,
      dcf_ebitda_margin_pct: 22,
      dcf_capex_pct: 4.4,
      dcf_da_pct: 3.3,
      dcf_nwc_pct: 1.2,
      dcf_tax_rate_pct: 25,
    })
  })

  it('seeds discount and perpetual terminal defaults only in the discount block', () => {
    const patch = buildDcfGlobalAssumptionsSeedPatch({
      variant: 'discountTerminalOnly',
      dcfInputMode: 'ebitda',
      terminalValueMethod: 'perpetual_growth',
      currentValues: {},
      smartDefaults: {
        revenueGrowthPct: 12,
        waccPct: 11,
        terminalGrowthPct: 2.5,
      },
    })

    expect(patch).toEqual({
      dcf_wacc_pct: 11,
      dcf_terminal_growth_pct: 2.5,
    })
  })

  it('uses exit multiple for EBITDA-mode exit-multiple terminal value', () => {
    const patch = buildDcfGlobalAssumptionsSeedPatch({
      variant: 'discountTerminalOnly',
      dcfInputMode: 'ebitda',
      terminalValueMethod: 'exit_multiple',
      currentValues: {},
      smartDefaults: {
        waccPct: 11,
        terminalGrowthPct: 2.5,
        exitMultiple: 7.2,
      },
    })

    expect(patch).toEqual({
      dcf_wacc_pct: 11,
      dcf_exit_multiple: 7.2,
    })
  })

  it('forces perpetual terminal defaults for FCFF-only mode and skips forecast fields', () => {
    const patch = buildDcfGlobalAssumptionsSeedPatch({
      variant: 'full',
      dcfInputMode: 'fcff_only',
      terminalValueMethod: 'exit_multiple',
      currentValues: {},
      smartDefaults: {
        revenueGrowthPct: 12,
        ebitdaMarginPct: 22,
        waccPct: 11,
        terminalGrowthPct: 2.5,
        exitMultiple: 7.2,
      },
    })

    expect(patch).toEqual({
      dcf_wacc_pct: 11,
      dcf_terminal_growth_pct: 2.5,
    })
  })

  it('prefers integration overrides for CapEx and D&A without overwriting user values', () => {
    const patch = buildDcfGlobalAssumptionsSeedPatch({
      variant: 'forecastDefaultsOnly',
      dcfInputMode: 'ebitda',
      terminalValueMethod: 'perpetual_growth',
      currentValues: {
        dcfRevenueGrowthPct: 4.2,
      },
      smartDefaults: {
        revenueGrowthPct: 12,
        capexPct: 4,
        daPct: 3,
      },
      integrationCapexPct: 5.7,
      integrationDaPct: 2.1,
    })

    expect(patch.dcf_revenue_growth_pct).toBeUndefined()
    expect(patch).toMatchObject({
      dcf_capex_pct: 5.7,
      dcf_da_pct: 2.1,
    })
  })

  it('returns no patch when disabled', () => {
    expect(
      buildDcfGlobalAssumptionsSeedPatch({
        disabled: true,
        variant: 'full',
        dcfInputMode: 'ebitda',
        terminalValueMethod: 'perpetual_growth',
        currentValues: {},
        smartDefaults: {
          revenueGrowthPct: 12,
          waccPct: 11,
        },
      })
    ).toEqual({})
  })
})
