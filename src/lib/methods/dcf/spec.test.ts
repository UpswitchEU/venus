import { describe, expect, it } from 'vitest'
import { dcfMethodSpec, DCF_METHOD_KEY } from './spec'

describe('dcfMethodSpec', () => {
  it('uses the canonical "dcf" key', () => {
    expect(DCF_METHOD_KEY).toBe('dcf')
    expect(dcfMethodSpec.key).toBe('dcf')
  })

  it('is combinable, not standalone, and pre-selectable', () => {
    expect(dcfMethodSpec.combinable).toBe(true)
    expect(dcfMethodSpec.standalone).toBe(false)
    expect(dcfMethodSpec.preSelectable).toBe(true)
  })

  it('requires only the dcf_projections bonus section', () => {
    expect(dcfMethodSpec.bonusSections).toEqual(['dcf_projections'])
  })

  it('declares no mutual exclusions (income approach blends with market/asset)', () => {
    expect(dcfMethodSpec.mutuallyExclusiveWith).toEqual([])
  })

  it('declares matching label + description i18n keys', () => {
    expect(dcfMethodSpec.labelKey).toBe('manualInput.methodSelector.dcf')
    expect(dcfMethodSpec.descriptionKey).toBe('manualInput.methodSelector.dcfDescription')
  })

  it('requires forecast years (its defining UI behaviour)', () => {
    expect(dcfMethodSpec.requiresForecastYears).toBe(true)
  })

  it('does not opt into any other method-specific capability', () => {
    expect(dcfMethodSpec.isAdaptive).toBe(false)
    expect(dcfMethodSpec.acceptsPreparerMultipleOverride).toBe(false)
    expect(dcfMethodSpec.requiresVenturePath).toBe(false)
    expect(dcfMethodSpec.requiresOwnerCompensation).toBe(false)
  })
})
