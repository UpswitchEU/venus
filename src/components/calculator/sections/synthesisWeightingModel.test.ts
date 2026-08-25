import { describe, expect, it } from 'vitest'
import type { ValuationMethodResult } from '@/types/valuation'
import {
  buildSynthesisWeightingModel,
  formatCompactCurrency,
  getSynthesisDcfApvBridge,
} from './synthesisWeightingModel'

const labelFor = (method: string) => `label:${method}`

function available(value: number, details?: Record<string, unknown>): ValuationMethodResult {
  return {
    available: true,
    label: 'method',
    value,
    details,
  }
}

describe('synthesis weighting model', () => {
  it('formats compact euro values consistently for previews and contribution rows', () => {
    expect(formatCompactCurrency(950)).toBe('€950')
    expect(formatCompactCurrency(12_400)).toBe('€12K')
    expect(formatCompactCurrency(1_250_000)).toBe('€1.3M')
    expect(formatCompactCurrency(-1_250_000)).toBe('-€1.3M')
  })

  it('exposes exact engine method rows without calculating monetary contributions', () => {
    const model = buildSynthesisWeightingModel({
      displayWeights: { dcf: 40, ebitda_multiple: 60, adjusted_nav: 0 },
      methods: ['dcf', 'ebitda_multiple', 'adjusted_nav'],
      resolveLabel: labelFor,
      total: 100,
      valuationResults: {
        dcf: available(1_000_000),
        ebitda_multiple: available(1_500_000),
        adjusted_nav: {
          available: false,
          label: 'Adjusted NAV',
          unavailable_reason: 'missing balance sheet',
          value: null,
        },
      },
    })

    expect(model.liveBlended).toBeNull()
    expect(model.contributionByMethod?.dcf.contribution).toBeNull()
    expect(model.contributionByMethod?.ebitda_multiple.contribution).toBeNull()
    expect(model.contributionByMethod?.dcf.equity).toBe(1_000_000)
    expect(model.contributionByMethod?.ebitda_multiple.equity).toBe(1_500_000)
    expect(model.contributionByMethod?.adjusted_nav.contribution).toBeNull()
    expect(model.contributionByMethod?.adjusted_nav.available).toBe(false)
  })

  it('blocks the blended preview when a positive-weight method is unavailable', () => {
    const model = buildSynthesisWeightingModel({
      displayWeights: { dcf: 40, ebitda_multiple: 60 },
      methods: ['dcf', 'ebitda_multiple'],
      resolveLabel: labelFor,
      total: 100,
      valuationResults: {
        dcf: available(1_000_000),
        ebitda_multiple: {
          available: false,
          label: 'EBITDA',
          unavailable_reason: 'missing EBITDA',
          value: null,
        },
      },
    })

    expect(model.liveBlended).toBeNull()
    expect(model.contributionByMethod?.ebitda_multiple.unavailableReason).toBe('missing EBITDA')
  })

  it('parses the DCF APV bridge from valuation details and ignores zero tax shields', () => {
    expect(
      getSynthesisDcfApvBridge(
        available(1_000_000, {
          apv_tax_shield_value: 0,
          apv_bridge_provenance: { customer_template_reconciliation: true },
        })
      )
    ).toBeNull()

    expect(
      getSynthesisDcfApvBridge(
        available(1_000_000, {
          apv_tax_shield_value: '2750.5',
          dcf_equity_value_before_apv: '997249.5',
          apv_discounting_convention: 'year_end',
          apv_bridge_provenance: {
            customer_template_reconciliation: true,
            included_in_dcf_value: false,
            separate_weighting_method: true,
            double_counting_guard: 'Already included in DCF.',
          },
        })
      )
    ).toEqual({
      convention: 'year_end',
      doubleCountingGuard: 'Already included in DCF.',
      includedInDcfValue: false,
      isCustomerTemplate: true,
      separateWeightingMethod: true,
      taxShield: 2750.5,
      valueBeforeBridge: 997249.5,
    })
  })
})
