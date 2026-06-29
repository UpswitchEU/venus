import { describe, expect, it } from 'vitest'
import {
  buildDcfGlobalAssumptionsSectionState,
  buildDcfGlobalAssumptionsSeedPatch,
} from './DcfGlobalAssumptionsModel'

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
      repairZeroEbitdaMarginPlaceholder: true,
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

  it('repairs a restored zero EBITDA margin placeholder when history implies a positive margin', () => {
    const patch = buildDcfGlobalAssumptionsSeedPatch({
      variant: 'forecastDefaultsOnly',
      dcfInputMode: 'ebitda',
      terminalValueMethod: 'perpetual_growth',
      repairZeroEbitdaMarginPlaceholder: true,
      currentValues: {
        dcfRevenueGrowthPct: 5,
        dcfEbitdaMarginPct: 0,
        dcfCapexPct: 4,
        dcfDaPct: 3,
        dcfNwcPct: 1.5,
        dcfTaxRatePct: 25,
      },
      smartDefaults: {
        revenueGrowthPct: 11.8,
        ebitdaMarginPct: 10,
      },
    })

    expect(patch).toEqual({
      dcf_ebitda_margin_pct: 10,
    })
  })

  it('keeps an explicit zero EBITDA margin when zero-placeholder repair is not active', () => {
    const patch = buildDcfGlobalAssumptionsSeedPatch({
      variant: 'forecastDefaultsOnly',
      dcfInputMode: 'ebitda',
      terminalValueMethod: 'perpetual_growth',
      currentValues: {
        dcfRevenueGrowthPct: 5,
        dcfEbitdaMarginPct: 0,
        dcfCapexPct: 4,
        dcfDaPct: 3,
        dcfNwcPct: 1.5,
        dcfTaxRatePct: 25,
      },
      smartDefaults: {
        revenueGrowthPct: 11.8,
        ebitdaMarginPct: 10,
      },
    })

    expect(patch).toEqual({})
  })

  it('normalizes restored numeric strings without replacing them with defaults', () => {
    const patch = buildDcfGlobalAssumptionsSeedPatch({
      variant: 'full',
      dcfInputMode: 'ebitda',
      terminalValueMethod: 'perpetual_growth',
      currentValues: {
        dcfRevenueGrowthPct: '4,5' as unknown as number,
        dcfEbitdaMarginPct: '18,5' as unknown as number,
        dcfCapexPct: '3,5' as unknown as number,
        dcfDaPct: '2,5' as unknown as number,
        dcfNwcPct: '0,75' as unknown as number,
        dcfTaxRatePct: '20,5' as unknown as number,
        dcfWaccPct: '9,5' as unknown as number,
        dcfTerminalGrowthPct: '2,25' as unknown as number,
      },
      smartDefaults: {
        revenueGrowthPct: 12,
        ebitdaMarginPct: 24,
        capexPct: 8,
        daPct: 7,
        nwcPct: 3,
        taxRatePct: 25,
        waccPct: 13,
        terminalGrowthPct: 3,
      },
      integrationCapexPct: 6,
      integrationDaPct: 5,
    })

    expect(patch).toEqual({
      dcf_revenue_growth_pct: 4.5,
      dcf_ebitda_margin_pct: 18.5,
      dcf_capex_pct: 3.5,
      dcf_da_pct: 2.5,
      dcf_nwc_pct: 0.75,
      dcf_tax_rate_pct: 20.5,
      dcf_wacc_pct: 9.5,
      dcf_terminal_growth_pct: 2.25,
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

  it('marks the forecast defaults section complete from finite EBITDA-mode defaults', () => {
    expect(
      buildDcfGlobalAssumptionsSectionState({
        variant: 'forecastDefaultsOnly',
        dcfInputMode: 'ebitda',
        terminalValueMethod: 'perpetual_growth',
        dcfRevenueGrowthPct: 3,
        dcfEbitdaMarginPct: 10,
      })
    ).toMatchObject({
      sectionComplete: true,
      showForecastDefaultsBlock: true,
      showDiscountTerminalBlock: false,
    })

    expect(
      buildDcfGlobalAssumptionsSectionState({
        variant: 'forecastDefaultsOnly',
        dcfInputMode: 'ebitda',
        terminalValueMethod: 'perpetual_growth',
        dcfRevenueGrowthPct: 3,
      }).sectionComplete
    ).toBe(false)
  })

  it('treats FCFF-only forecast defaults as complete without EBITDA placeholder fields', () => {
    expect(
      buildDcfGlobalAssumptionsSectionState({
        variant: 'forecastDefaultsOnly',
        dcfInputMode: 'fcff_only',
        terminalValueMethod: 'exit_multiple',
      }).sectionComplete
    ).toBe(true)
  })

  it('requires WACC and the active terminal input for the discount section', () => {
    expect(
      buildDcfGlobalAssumptionsSectionState({
        variant: 'discountTerminalOnly',
        dcfInputMode: 'ebitda',
        terminalValueMethod: 'exit_multiple',
        dcfWaccPct: 11,
        dcfExitMultiple: 6.5,
      })
    ).toMatchObject({
      sectionComplete: true,
      showForecastDefaultsBlock: false,
      showDiscountTerminalBlock: true,
    })

    expect(
      buildDcfGlobalAssumptionsSectionState({
        variant: 'discountTerminalOnly',
        dcfInputMode: 'ebitda',
        terminalValueMethod: 'exit_multiple',
        dcfWaccPct: 11,
        dcfTerminalGrowthPct: 2,
      }).sectionComplete
    ).toBe(false)
  })

  it('forces the perpetual terminal completion path for FCFF-only discount sections', () => {
    expect(
      buildDcfGlobalAssumptionsSectionState({
        variant: 'discountTerminalOnly',
        dcfInputMode: 'fcff_only',
        terminalValueMethod: 'exit_multiple',
        dcfWaccPct: 11,
        dcfTerminalGrowthPct: 2,
      }).sectionComplete
    ).toBe(true)
  })
})
