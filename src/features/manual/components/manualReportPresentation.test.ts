import { describe, expect, it } from 'vitest'

import {
  deriveManualReportPresentation,
  deriveNavPricesForVersionNav,
} from './manualReportPresentation'

describe('deriveManualReportPresentation', () => {
  it('resolves omzet_multiple from revenue_multiple-only map in presentation', () => {
    const result: any = {
      selected_valuation_method: 'omzet_multiple',
      valuation_results: {
        revenue_multiple: {
          available: true,
          value: 150_000,
          multiple_used: 1.2,
          details: { equity_range_low: 120_000, equity_range_high: 180_000 },
        },
      },
    }

    const presentation = deriveManualReportPresentation(result, 'omzet_multiple')

    expect(presentation.valuation).toBe(150_000)
    expect(presentation.valuationLow).toBe(120_000)
    expect(presentation.valuationHigh).toBe(180_000)
    expect(presentation.multiple).toBe(1.2)
  })

  it('prefers selected method multiple over raw multiples valuation', () => {
    const result: any = {
      selected_valuation_method: 'upswitch_adaptive',
      equity_value_mid: 357000,
      equity_value_low: 261000,
      equity_value_high: 423000,
      multiples_valuation: { ebitda_multiple: 4.75 },
      valuation_results: {
        upswitch_adaptive: {
          available: true,
          value: 357000,
          multiple_used: 3.45,
          details: {
            equity_range_low: 261000,
            equity_range_high: 423000,
            p25_multiple: 2.59,
            p75_multiple: 4.6,
          },
        },
      },
    }

    const presentation = deriveManualReportPresentation(result, 'upswitch_adaptive')

    expect(presentation.valuation).toBe(357000)
    expect(presentation.valuationLow).toBe(261000)
    expect(presentation.valuationHigh).toBe(423000)
    expect(presentation.multiple).toBe(3.45)
    expect(presentation.multipleRange).toEqual({ low: 2.59, high: 4.6 })
  })

  it('falls back to report payload multiple when no method-specific multiple exists', () => {
    const result: any = {
      valuation_result: { multiple: 4.2 },
      equity_value_mid: 420000,
      equity_value_low: 340000,
      equity_value_high: 500000,
      valuation_results: {
        ebitda_multiple: {
          available: true,
          value: 420000,
          details: {},
        },
      },
    }

    const presentation = deriveManualReportPresentation(result, 'ebitda_multiple')

    expect(presentation.multiple).toBe(4.2)
    expect(presentation.valuationLow).toBe(340000)
    expect(presentation.valuationHigh).toBe(500000)
  })
})

describe('deriveNavPricesForVersionNav', () => {
  it('resolves range/ask from valuation_results details when top-level equity fields are absent (nav parity)', () => {
    const result: any = {
      selected_valuation_method: 'upswitch_adaptive',
      valuation_results: {
        upswitch_adaptive: {
          available: true,
          value: 357000,
          details: {
            equity_range_low: 261000,
            equity_range_high: 423000,
          },
        },
      },
    }

    const nav = deriveNavPricesForVersionNav(result, 'upswitch_adaptive')

    expect(nav.priceRange.min).toBe(261000)
    expect(nav.priceRange.max).toBe(423000)
    expect(nav.askPrice).toBe(357000)
  })

  it('uses recommended_asking_price when present', () => {
    const result: any = {
      selected_valuation_method: 'upswitch_adaptive',
      recommended_asking_price: 400000,
      valuation_results: {
        upswitch_adaptive: {
          available: true,
          value: 357000,
          details: {
            equity_range_low: 261000,
            equity_range_high: 423000,
          },
        },
      },
    }

    expect(deriveNavPricesForVersionNav(result, 'upswitch_adaptive').askPrice).toBe(400000)
  })
})
