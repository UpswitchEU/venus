import { describe, expect, it } from 'vitest'
import { OMZET_MULTIPLE_METHOD_KEY, omzetMultipleMethodSpec } from './spec'

describe('omzetMultipleMethodSpec', () => {
  it('uses the canonical "omzet_multiple" key', () => {
    expect(OMZET_MULTIPLE_METHOD_KEY).toBe('omzet_multiple')
    expect(omzetMultipleMethodSpec.key).toBe('omzet_multiple')
  })

  it('is combinable, not standalone, and pre-selectable (the NL-canonical surface)', () => {
    expect(omzetMultipleMethodSpec.combinable).toBe(true)
    expect(omzetMultipleMethodSpec.standalone).toBe(false)
    expect(omzetMultipleMethodSpec.preSelectable).toBe(true)
  })

  it('requires the revenue_quality bonus section', () => {
    expect(omzetMultipleMethodSpec.bonusSections).toEqual(['revenue_quality'])
  })

  it('is mutually exclusive with revenue_multiple (EN alias, same economics)', () => {
    expect(omzetMultipleMethodSpec.mutuallyExclusiveWith).toEqual(['revenue_multiple'])
  })

  it('declares matching label + description i18n keys (shared with EN alias)', () => {
    expect(omzetMultipleMethodSpec.labelKey).toBe('manualInput.methodSelector.revenueMultiple')
    expect(omzetMultipleMethodSpec.descriptionKey).toBe(
      'manualInput.methodSelector.revenueMultipleDescription'
    )
  })

  it('does not opt into any method-specific UI capability', () => {
    expect(omzetMultipleMethodSpec.isAdaptive).toBe(false)
    expect(omzetMultipleMethodSpec.acceptsPreparerMultipleOverride).toBe(false)
    expect(omzetMultipleMethodSpec.requiresVenturePath).toBe(false)
    expect(omzetMultipleMethodSpec.requiresForecastYears).toBe(false)
    expect(omzetMultipleMethodSpec.requiresOwnerCompensation).toBe(false)
  })
})
