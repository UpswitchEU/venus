import { describe, expect, it } from 'vitest'
import { STARTUP_VALUATION_METHOD_KEY, startupValuationMethodSpec } from './spec'

describe('startupValuationMethodSpec', () => {
  it('uses the canonical "startup_valuation" key', () => {
    expect(STARTUP_VALUATION_METHOD_KEY).toBe('startup_valuation')
    expect(startupValuationMethodSpec.key).toBe('startup_valuation')
  })

  it('is standalone, not combinable (different inputs + engine from SME methods)', () => {
    expect(startupValuationMethodSpec.combinable).toBe(false)
    expect(startupValuationMethodSpec.standalone).toBe(true)
  })

  it('is pre-selectable in the top-bar dropdown', () => {
    expect(startupValuationMethodSpec.preSelectable).toBe(true)
  })

  it('does not declare bonus sections (StartupAwareInputPanel handles its own UI)', () => {
    expect(startupValuationMethodSpec.bonusSections).toEqual([])
  })

  it('declares no mutual exclusions (standalone covers it)', () => {
    expect(startupValuationMethodSpec.mutuallyExclusiveWith).toEqual([])
  })

  it('declares matching label + description i18n keys', () => {
    expect(startupValuationMethodSpec.labelKey).toBe('manualInput.methodSelector.startupValuation')
    expect(startupValuationMethodSpec.descriptionKey).toBe(
      'manualInput.methodSelector.startupValuationDescription'
    )
  })

  it('requires the venture path (its defining UI behaviour)', () => {
    expect(startupValuationMethodSpec.requiresVenturePath).toBe(true)
  })

  it('does not opt into any other method-specific capability', () => {
    expect(startupValuationMethodSpec.isAdaptive).toBe(false)
    expect(startupValuationMethodSpec.acceptsPreparerMultipleOverride).toBe(false)
    expect(startupValuationMethodSpec.requiresForecastYears).toBe(false)
    expect(startupValuationMethodSpec.requiresOwnerCompensation).toBe(false)
  })
})
