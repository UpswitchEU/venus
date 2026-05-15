import { describe, expect, it } from 'vitest'
import { fiscal4xMethodSpec, FISCAL_4X_METHOD_KEY } from './spec'

describe('fiscal4xMethodSpec', () => {
  it('uses the canonical "fiscal_4x" key', () => {
    expect(FISCAL_4X_METHOD_KEY).toBe('fiscal_4x')
    expect(fiscal4xMethodSpec.key).toBe('fiscal_4x')
  })

  it('is standalone, not combinable (legal-purpose distinct from going-concern lens)', () => {
    expect(fiscal4xMethodSpec.combinable).toBe(false)
    expect(fiscal4xMethodSpec.standalone).toBe(true)
  })

  it('is pre-selectable in the top-bar dropdown', () => {
    expect(fiscal4xMethodSpec.preSelectable).toBe(true)
  })

  it('requires the fiscal_inputs bonus section (Art. 90 WIB 92 worksheet)', () => {
    expect(fiscal4xMethodSpec.bonusSections).toEqual(['fiscal_inputs'])
  })

  it('declares no mutual exclusions (standalone covers it)', () => {
    expect(fiscal4xMethodSpec.mutuallyExclusiveWith).toEqual([])
  })

  it('declares matching label + description i18n keys', () => {
    expect(fiscal4xMethodSpec.labelKey).toBe('manualInput.methodSelector.fiscal4x')
    expect(fiscal4xMethodSpec.descriptionKey).toBe(
      'manualInput.methodSelector.fiscal4xDescription'
    )
  })

  it('does not opt into any method-specific UI capability', () => {
    expect(fiscal4xMethodSpec.isAdaptive).toBe(false)
    expect(fiscal4xMethodSpec.acceptsPreparerMultipleOverride).toBe(false)
    expect(fiscal4xMethodSpec.requiresVenturePath).toBe(false)
    expect(fiscal4xMethodSpec.requiresForecastYears).toBe(false)
    expect(fiscal4xMethodSpec.requiresOwnerCompensation).toBe(false)
  })
})
