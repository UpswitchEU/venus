import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/backendApi', () => ({
  backendAPI: { calculateStartupPreview: vi.fn() },
}))
import { valuationIqPreviewToLiveValuation } from './useLiveValuation'

const canonicalResponse = {
  valuation_authority: {
    schema_version: 'valuation_iq_preview_authority.v1',
    authority: 'valuation_iq',
  },
  valuation_results: {
    startup_valuation: {
      available: true,
      value: '3100000',
      details: {
        canonical: {
          pre_money_low: 2_000_000,
          pre_money_mid: 3_100_000,
          pre_money_high: 4_500_000,
        },
        equity_value_low: 1_900_000,
        equity_value_mid: 3_000_000,
        equity_value_high: 4_400_000,
        contributors: ['berkus', 'scorecard', 'vc'],
        founder_view: {
          contributors: ['berkus', 'vc'],
          weights: { berkus: 0.4, vc: 0.6 },
        },
        berkus: { pre_money: 2_200_000 },
        scorecard: { pre_money: 2_500_000 },
        vc: { pre_money: 3_700_000 },
        saas_forward: { pre_money: 0, available: false },
        pre_pedigree: {
          equity_value_low: 1_800_000,
          equity_value_mid: 2_800_000,
          equity_value_high: 4_000_000,
        },
        founder_pedigree: { multiplier: 1.1 },
        inception_lens: {
          lens: 'momentum_driven',
          multiplier: 1.1,
          band_widen_pct: 0.15,
          pre_lens: {
            equity_value_low: 1_950_000,
            equity_value_mid: 3_000_000,
            equity_value_high: 4_250_000,
          },
        },
      },
    },
  },
}

describe('valuationIqPreviewToLiveValuation', () => {
  it('copies the canonical ValuationIQ band and method evidence without recalculating it', () => {
    const output = valuationIqPreviewToLiveValuation(canonicalResponse)

    expect(output.blended).toEqual({ low: 2_000_000, mid: 3_100_000, high: 4_500_000 })
    expect(output.blendedPrePedigree).toEqual({
      low: 1_800_000,
      mid: 2_800_000,
      high: 4_000_000,
    })
    expect(output.blendedPreLens).toEqual({
      low: 1_950_000,
      mid: 3_000_000,
      high: 4_250_000,
    })
    expect(output.pedigreeMultiplier).toBe(1.1)
    expect(output.inceptionLens).toBe('momentum_driven')
    expect(output.legs.find((leg) => leg.key === 'berkus')).toMatchObject({
      value: 2_200_000,
      weight: 0.4,
      unavailable: false,
      low: null,
      high: null,
    })
    expect(output.legs.find((leg) => leg.key === 'scorecard')?.unavailable).toBe(true)
    expect(output.legs.find((leg) => leg.key === 'saas_forward')?.unavailable).toBe(true)
  })

  it('fails closed when the numeric response does not identify ValuationIQ authority', () => {
    const forged = { ...canonicalResponse, valuation_authority: { authority: 'venus' } }
    expect(valuationIqPreviewToLiveValuation(forged).blended).toBeNull()
    expect(valuationIqPreviewToLiveValuation(forged).isEmpty).toBe(true)
  })

  it('fails closed when the canonical engine band is incomplete', () => {
    const incomplete = structuredClone(canonicalResponse)
    incomplete.valuation_results.startup_valuation.details.canonical.pre_money_high = null as never
    expect(valuationIqPreviewToLiveValuation(incomplete).blended).toBeNull()
  })
})
