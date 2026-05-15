import { describe, expect, it } from 'vitest'
import { revenueMultipleMethodSpec, REVENUE_MULTIPLE_METHOD_KEY } from './spec'

describe('revenueMultipleMethodSpec', () => {
  it('uses the canonical "revenue_multiple" key (EN alias)', () => {
    expect(REVENUE_MULTIPLE_METHOD_KEY).toBe('revenue_multiple')
    expect(revenueMultipleMethodSpec.key).toBe('revenue_multiple')
  })

  it('is combinable but NOT preSelectable (the NL key is the user-facing surface)', () => {
    expect(revenueMultipleMethodSpec.combinable).toBe(true)
    expect(revenueMultipleMethodSpec.standalone).toBe(false)
    expect(revenueMultipleMethodSpec.preSelectable).toBe(false)
  })

  it('requires the revenue_quality bonus section (shared with NL alias)', () => {
    expect(revenueMultipleMethodSpec.bonusSections).toEqual(['revenue_quality'])
  })

  it('is mutually exclusive with omzet_multiple (NL alias, same economics)', () => {
    expect(revenueMultipleMethodSpec.mutuallyExclusiveWith).toEqual(['omzet_multiple'])
  })

  it('shares its i18n label + description with the NL alias', () => {
    expect(revenueMultipleMethodSpec.labelKey).toBe(
      'manualInput.methodSelector.revenueMultiple'
    )
    expect(revenueMultipleMethodSpec.descriptionKey).toBe(
      'manualInput.methodSelector.revenueMultipleDescription'
    )
  })

  it('does not opt into any method-specific UI capability', () => {
    expect(revenueMultipleMethodSpec.isAdaptive).toBe(false)
    expect(revenueMultipleMethodSpec.acceptsPreparerMultipleOverride).toBe(false)
    expect(revenueMultipleMethodSpec.requiresVenturePath).toBe(false)
    expect(revenueMultipleMethodSpec.requiresForecastYears).toBe(false)
    expect(revenueMultipleMethodSpec.requiresOwnerCompensation).toBe(false)
  })
})
