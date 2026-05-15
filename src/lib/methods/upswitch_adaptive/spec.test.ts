import { describe, expect, it } from 'vitest'
import {
  upswitchAdaptiveMethodSpec,
  UPSWITCH_ADAPTIVE_METHOD_KEY,
} from './spec'

describe('upswitchAdaptiveMethodSpec', () => {
  it('uses the canonical "upswitch_adaptive" key', () => {
    expect(UPSWITCH_ADAPTIVE_METHOD_KEY).toBe('upswitch_adaptive')
    expect(upswitchAdaptiveMethodSpec.key).toBe('upswitch_adaptive')
  })

  it('is the adaptive sentinel + standalone (the umbrella default)', () => {
    expect(upswitchAdaptiveMethodSpec.isAdaptive).toBe(true)
    expect(upswitchAdaptiveMethodSpec.standalone).toBe(true)
    expect(upswitchAdaptiveMethodSpec.combinable).toBe(false)
  })

  it('is pre-selectable in the top-bar dropdown', () => {
    expect(upswitchAdaptiveMethodSpec.preSelectable).toBe(true)
  })

  it('declares no bonus sections (engine derives from base inputs)', () => {
    expect(upswitchAdaptiveMethodSpec.bonusSections).toEqual([])
  })

  it('accepts the preparer multiple override (adaptive uses EBITDA × under the hood)', () => {
    expect(upswitchAdaptiveMethodSpec.acceptsPreparerMultipleOverride).toBe(true)
  })

  it('declares matching label + description i18n keys', () => {
    expect(upswitchAdaptiveMethodSpec.labelKey).toBe(
      'manualInput.methodSelector.adaptiveRecommended'
    )
    expect(upswitchAdaptiveMethodSpec.descriptionKey).toBe(
      'manualInput.methodSelector.adaptiveDescription'
    )
  })

  it('does not opt into any other method-specific capability', () => {
    expect(upswitchAdaptiveMethodSpec.requiresVenturePath).toBe(false)
    expect(upswitchAdaptiveMethodSpec.requiresForecastYears).toBe(false)
    expect(upswitchAdaptiveMethodSpec.requiresOwnerCompensation).toBe(false)
  })
})
