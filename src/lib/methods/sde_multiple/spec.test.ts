import { describe, expect, it } from 'vitest'
import { sdeMultipleMethodSpec, SDE_MULTIPLE_METHOD_KEY } from './spec'

describe('sdeMultipleMethodSpec', () => {
  it('uses the canonical "sde_multiple" key', () => {
    expect(SDE_MULTIPLE_METHOD_KEY).toBe('sde_multiple')
    expect(sdeMultipleMethodSpec.key).toBe('sde_multiple')
  })

  it('is combinable, not standalone, and pre-selectable', () => {
    expect(sdeMultipleMethodSpec.combinable).toBe(true)
    expect(sdeMultipleMethodSpec.standalone).toBe(false)
    expect(sdeMultipleMethodSpec.preSelectable).toBe(true)
  })

  it('requires the sde_owner_compensation bonus section', () => {
    expect(sdeMultipleMethodSpec.bonusSections).toEqual(['sde_owner_compensation'])
  })

  it('is mutually exclusive with ebitda_multiple and adjusted_nav', () => {
    expect(new Set(sdeMultipleMethodSpec.mutuallyExclusiveWith)).toEqual(
      new Set(['ebitda_multiple', 'adjusted_nav'])
    )
  })

  it('declares matching label + description i18n keys', () => {
    expect(sdeMultipleMethodSpec.labelKey).toBe('manualInput.methodSelector.sdeMultiple')
    expect(sdeMultipleMethodSpec.descriptionKey).toBe(
      'manualInput.methodSelector.sdeMultipleDescription'
    )
  })

  it('requires owner-compensation input (its defining UI behaviour)', () => {
    expect(sdeMultipleMethodSpec.requiresOwnerCompensation).toBe(true)
  })

  it('does not opt into any other method-specific capability', () => {
    expect(sdeMultipleMethodSpec.isAdaptive).toBe(false)
    expect(sdeMultipleMethodSpec.acceptsPreparerMultipleOverride).toBe(false)
    expect(sdeMultipleMethodSpec.requiresVenturePath).toBe(false)
    expect(sdeMultipleMethodSpec.requiresForecastYears).toBe(false)
  })
})
