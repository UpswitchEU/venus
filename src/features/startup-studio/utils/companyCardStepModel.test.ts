import { describe, expect, it } from 'vitest'
import {
  buildBusinessStructurePatch,
  buildCompanyCardClearPatch,
  buildCompanyCardCountryResetPatch,
  formatMaterialRevenueNudgeMrr,
  getLegalFormOptions,
  hasMaterialRecurringRevenue,
  resolveStageDefaultRaiseSeed,
  updateSegmentEarningsValue,
  updateSegmentWeightValue,
} from './companyCardStepModel'

describe('getLegalFormOptions', () => {
  it('returns country-specific legal forms and falls back to Belgium', () => {
    expect(getLegalFormOptions('NL').map((option) => option.value)).toContain('stichting')
    expect(getLegalFormOptions('FR').map((option) => option.value)).toContain('sarl')
    expect(getLegalFormOptions('XX').map((option) => option.value)).toEqual(
      getLegalFormOptions('BE').map((option) => option.value)
    )
  })

  it('returns a defensive copy so callers cannot mutate shared options', () => {
    const options = getLegalFormOptions('BE')
    options.pop()

    expect(getLegalFormOptions('BE')).toHaveLength(6)
  })
})

describe('resolveStageDefaultRaiseSeed', () => {
  it('seeds a missing raise from the selected stage default', () => {
    expect(resolveStageDefaultRaiseSeed({ stage: 'pre_seed', raise: null })).toBe(250_000)
  })

  it('re-seeds when the current raise is still one of the stage defaults', () => {
    expect(resolveStageDefaultRaiseSeed({ stage: 'series_a', raise: 750_000 })).toBe(3_000_000)
  })

  it('does not clobber a founder override', () => {
    expect(resolveStageDefaultRaiseSeed({ stage: 'seed', raise: 600_000 })).toBeNull()
  })
})

describe('material recurring revenue nudge', () => {
  it('triggers before Series A when MRR or ARR crosses the SaaS pivot', () => {
    expect(hasMaterialRecurringRevenue({ stage: 'pre_seed', mrr: 10_000, arr: null })).toBe(true)
    expect(hasMaterialRecurringRevenue({ stage: 'seed', mrr: null, arr: 120_000 })).toBe(true)
  })

  it('suppresses the nudge for Series A and below-threshold revenue', () => {
    expect(hasMaterialRecurringRevenue({ stage: 'series_a', mrr: 50_000, arr: null })).toBe(false)
    expect(hasMaterialRecurringRevenue({ stage: 'seed', mrr: 9_999, arr: 119_999 })).toBe(false)
  })

  it('formats the translated MRR token from either MRR or ARR', () => {
    expect(formatMaterialRevenueNudgeMrr({ mrr: 10_400, arr: null })).toBe('10.4')
    expect(formatMaterialRevenueNudgeMrr({ mrr: null, arr: 180_000 })).toBe('15')
  })
})

describe('company-card form patches', () => {
  it('clears stale identity fields in the same country-change patch', () => {
    expect(buildCompanyCardCountryResetPatch('nl')).toMatchObject({
      country_code: 'NL',
      company_name: '',
      kbo_number: undefined,
      legal_form: undefined,
      business_structure: undefined,
      business_type_id: undefined,
    })
  })

  it('clears all company identity and business-type fields', () => {
    expect(buildCompanyCardClearPatch()).toMatchObject({
      company_name: '',
      business_type_id: undefined,
      business_type_title: undefined,
      business_type_segments: [],
      business_model: undefined,
      business_structure: undefined,
    })
  })

  it('bridges registry legal forms into the downstream business structure field', () => {
    expect(buildBusinessStructurePatch('BV')).toEqual({ business_structure: 'bv' })
    expect(buildBusinessStructurePatch('unknown form')).toEqual({ business_structure: undefined })
  })
})

describe('segment patch helpers', () => {
  const segments = [
    { business_type_id: 'a', earnings: '100', weight: 60 },
    { business_type_id: 'b', earnings: '200', weight: 40 },
  ]

  it('updates only the targeted segment earnings and preserves immutability', () => {
    const result = updateSegmentEarningsValue(segments, 1, '')

    expect(result).not.toBe(segments)
    expect(result[0]).toBe(segments[0])
    expect(result[1]).toMatchObject({ earnings: null })
  })

  it('updates only the targeted segment weight and stores blanks as null', () => {
    const result = updateSegmentWeightValue(segments, 0, '55')
    const cleared = updateSegmentWeightValue(segments, 1, ' ')

    expect(result[0]).toMatchObject({ weight: '55' })
    expect(cleared[1]).toMatchObject({ weight: null })
  })
})
