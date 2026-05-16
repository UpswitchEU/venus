import { describe, expect, it } from 'vitest'
import { ARR_MULTIPLE_METHOD_KEY, arrMultipleMethodSpec } from './spec'

describe('arrMultipleMethodSpec', () => {
  it('uses the canonical "arr_multiple" key', () => {
    expect(ARR_MULTIPLE_METHOD_KEY).toBe('arr_multiple')
    expect(arrMultipleMethodSpec.key).toBe('arr_multiple')
  })

  it('is combinable, not standalone, and pre-selectable', () => {
    expect(arrMultipleMethodSpec.combinable).toBe(true)
    expect(arrMultipleMethodSpec.standalone).toBe(false)
    expect(arrMultipleMethodSpec.preSelectable).toBe(true)
  })

  it('requires the saas_metrics bonus section (its defining UI surface)', () => {
    expect(arrMultipleMethodSpec.bonusSections).toEqual(['saas_metrics'])
  })

  it('declares no mutual exclusions (blends with EBITDA × for mature SaaS)', () => {
    expect(arrMultipleMethodSpec.mutuallyExclusiveWith).toEqual([])
  })

  it('declares matching label + description i18n keys', () => {
    expect(arrMultipleMethodSpec.labelKey).toBe('manualInput.methodSelector.arrMultiple')
    expect(arrMultipleMethodSpec.descriptionKey).toBe(
      'manualInput.methodSelector.arrMultipleDescription'
    )
  })

  it('does not opt into any method-specific UI capability', () => {
    expect(arrMultipleMethodSpec.isAdaptive).toBe(false)
    expect(arrMultipleMethodSpec.acceptsPreparerMultipleOverride).toBe(false)
    expect(arrMultipleMethodSpec.requiresVenturePath).toBe(false)
    expect(arrMultipleMethodSpec.requiresForecastYears).toBe(false)
    expect(arrMultipleMethodSpec.requiresOwnerCompensation).toBe(false)
  })
})
