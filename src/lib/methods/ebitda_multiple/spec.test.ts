import { describe, expect, it } from 'vitest'
import { ebitdaMultipleMethodSpec, EBITDA_MULTIPLE_METHOD_KEY } from './spec'

describe('ebitdaMultipleMethodSpec', () => {
  it('uses the canonical "ebitda_multiple" key', () => {
    expect(EBITDA_MULTIPLE_METHOD_KEY).toBe('ebitda_multiple')
    expect(ebitdaMultipleMethodSpec.key).toBe('ebitda_multiple')
  })

  it('is combinable, not standalone, and pre-selectable', () => {
    expect(ebitdaMultipleMethodSpec.combinable).toBe(true)
    expect(ebitdaMultipleMethodSpec.standalone).toBe(false)
    expect(ebitdaMultipleMethodSpec.preSelectable).toBe(true)
  })

  it('requires the revenue_quality bonus section (and only that one)', () => {
    expect(ebitdaMultipleMethodSpec.bonusSections).toEqual(['revenue_quality'])
  })

  it('is mutually exclusive with sde_multiple (different owner-compensation base)', () => {
    expect(ebitdaMultipleMethodSpec.mutuallyExclusiveWith).toEqual(['sde_multiple'])
  })

  it('declares matching label + description i18n keys', () => {
    expect(ebitdaMultipleMethodSpec.labelKey).toBe('manualInput.methodSelector.ebitdaMultiple')
    expect(ebitdaMultipleMethodSpec.descriptionKey).toBe(
      'manualInput.methodSelector.ebitdaMultipleDescription'
    )
  })

  it('accepts the preparer multiple override (the right-rail preview tile)', () => {
    expect(ebitdaMultipleMethodSpec.acceptsPreparerMultipleOverride).toBe(true)
  })

  it('does not opt into any other method-specific capability', () => {
    expect(ebitdaMultipleMethodSpec.isAdaptive).toBe(false)
    expect(ebitdaMultipleMethodSpec.requiresVenturePath).toBe(false)
    expect(ebitdaMultipleMethodSpec.requiresForecastYears).toBe(false)
    expect(ebitdaMultipleMethodSpec.requiresOwnerCompensation).toBe(false)
  })
})
