import { describe, expect, it } from 'vitest'
import { adjustedNavMethodSpec, ADJUSTED_NAV_METHOD_KEY } from './spec'

describe('adjustedNavMethodSpec', () => {
  it('uses the canonical "adjusted_nav" key', () => {
    expect(ADJUSTED_NAV_METHOD_KEY).toBe('adjusted_nav')
    expect(adjustedNavMethodSpec.key).toBe('adjusted_nav')
  })

  it('is combinable, not standalone, and pre-selectable', () => {
    expect(adjustedNavMethodSpec.combinable).toBe(true)
    expect(adjustedNavMethodSpec.standalone).toBe(false)
    expect(adjustedNavMethodSpec.preSelectable).toBe(true)
  })

  it('requires the nav_asset_schedule bonus section (and only that one)', () => {
    expect(adjustedNavMethodSpec.bonusSections).toEqual(['nav_asset_schedule'])
  })

  it('is mutually exclusive with sde_multiple (SDE excludes balance-sheet-driven valuations)', () => {
    expect(adjustedNavMethodSpec.mutuallyExclusiveWith).toEqual(['sde_multiple'])
  })

  it('declares matching label + description i18n keys', () => {
    expect(adjustedNavMethodSpec.labelKey).toBe('manualInput.methodSelector.adjustedNav')
    expect(adjustedNavMethodSpec.descriptionKey).toBe(
      'manualInput.methodSelector.adjustedNavDescription'
    )
  })

  it('does not opt into any method-specific capability (pure asset-approach floor)', () => {
    expect(adjustedNavMethodSpec.isAdaptive).toBe(false)
    expect(adjustedNavMethodSpec.acceptsPreparerMultipleOverride).toBe(false)
    expect(adjustedNavMethodSpec.requiresVenturePath).toBe(false)
    expect(adjustedNavMethodSpec.requiresForecastYears).toBe(false)
    expect(adjustedNavMethodSpec.requiresOwnerCompensation).toBe(false)
  })
})
