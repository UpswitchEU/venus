/**
 * Registry-wide invariants. These tests fail loudly if a future method spec
 * drifts from the rules the rest of the codebase depends on.
 */

import { describe, expect, it } from 'vitest'
import {
  deriveCombinableMethods,
  deriveMethodDescriptionKeys,
  deriveMethodFieldConfig,
  deriveMethodLabelKeys,
  deriveMutuallyExclusivePairs,
  derivePreSelectableMethods,
  deriveStandaloneMethods,
  getMethodSpec,
  isAdaptiveMethodKey,
  isVenturePathMethodKey,
  METHOD_SPECS,
  methodKeyAcceptsPreparerMultipleOverride,
  methodKeyRequiresForecastYears,
  ORDERED_METHOD_SPECS,
  selectionAppliesRealEstateCarveOut,
  selectionRequiresForecastYears,
  selectionRequiresOwnerCompensation,
} from '../registry'

const EXPECTED_METHOD_KEYS = [
  'upswitch_adaptive',
  'omzet_multiple',
  'revenue_multiple',
  'arr_multiple',
  'ebitda_multiple',
  'dcf',
  'sde_multiple',
  'adjusted_nav',
  'real_estate_yield',
  'fiscal_4x',
  'startup_valuation',
  'liquidation_analysis',
] as const

const ALL_INPUT_SECTION_KEYS = [
  'dcf_projections',
  'nav_asset_schedule',
  'saas_metrics',
  'revenue_quality',
  'sde_owner_compensation',
  'liquidation_inputs',
  'fiscal_inputs',
] as const

describe('METHOD_SPECS', () => {
  it('contains every expected method key', () => {
    for (const key of EXPECTED_METHOD_KEYS) {
      expect(METHOD_SPECS[key], `missing spec for ${key}`).toBeDefined()
      expect(METHOD_SPECS[key].key).toBe(key)
    }
  })

  it('has exactly the expected method keys (no extras, no orphans)', () => {
    expect(new Set(Object.keys(METHOD_SPECS))).toEqual(new Set(EXPECTED_METHOD_KEYS))
  })

  it('exposes the same specs through ORDERED_METHOD_SPECS', () => {
    expect(ORDERED_METHOD_SPECS.length).toBe(Object.keys(METHOD_SPECS).length)
    for (const spec of ORDERED_METHOD_SPECS) {
      expect(METHOD_SPECS[spec.key]).toBe(spec)
    }
  })

  it('returns specs through getMethodSpec', () => {
    expect(getMethodSpec('dcf')?.key).toBe('dcf')
    expect(getMethodSpec('nonexistent')).toBeUndefined()
  })
})

describe('per-spec invariants', () => {
  it.each(EXPECTED_METHOD_KEYS)('%s is not both combinable and standalone', (key) => {
    const spec = METHOD_SPECS[key]
    expect(spec.combinable && spec.standalone, `${key} is both`).toBe(false)
  })

  it.each(
    EXPECTED_METHOD_KEYS
  )('%s declares either combinable or standalone (never neither)', (key) => {
    const spec = METHOD_SPECS[key]
    expect(spec.combinable || spec.standalone, `${key} declared as neither`).toBe(true)
  })

  it.each(EXPECTED_METHOD_KEYS)('%s declares a non-empty labelKey', (key) => {
    expect(METHOD_SPECS[key].labelKey).toMatch(/^manualInput\.methodSelector\./)
  })

  it.each(EXPECTED_METHOD_KEYS)('%s declares only known InputSectionKey bonus sections', (key) => {
    for (const section of METHOD_SPECS[key].bonusSections) {
      expect(ALL_INPUT_SECTION_KEYS).toContain(section)
    }
  })

  it.each(EXPECTED_METHOD_KEYS)('%s does not declare itself as mutually exclusive', (key) => {
    expect(METHOD_SPECS[key].mutuallyExclusiveWith).not.toContain(key)
  })

  it('mutual-exclusion declarations are symmetric across specs', () => {
    for (const spec of ORDERED_METHOD_SPECS) {
      for (const other of spec.mutuallyExclusiveWith) {
        const otherSpec = METHOD_SPECS[other]
        expect(otherSpec, `${spec.key} excludes unknown method ${other}`).toBeDefined()
        expect(
          otherSpec.mutuallyExclusiveWith,
          `${spec.key} excludes ${other} but ${other} does not exclude ${spec.key}`
        ).toContain(spec.key)
      }
    }
  })
})

describe('derivation helpers', () => {
  it('deriveCombinableMethods matches every spec where combinable===true', () => {
    const expected = new Set(ORDERED_METHOD_SPECS.filter((s) => s.combinable).map((s) => s.key))
    expect(deriveCombinableMethods()).toEqual(expected)
  })

  it('deriveStandaloneMethods matches every spec where standalone===true', () => {
    const expected = new Set(ORDERED_METHOD_SPECS.filter((s) => s.standalone).map((s) => s.key))
    expect(deriveStandaloneMethods()).toEqual(expected)
  })

  it('derivePreSelectableMethods matches every spec where preSelectable===true', () => {
    const expected = ORDERED_METHOD_SPECS.filter((s) => s.preSelectable).map((s) => s.key)
    expect(derivePreSelectableMethods()).toEqual(expected)
  })

  it('deriveMethodFieldConfig produces a frozen Record<key, { bonusSections }> for every spec', () => {
    const cfg = deriveMethodFieldConfig()
    for (const spec of ORDERED_METHOD_SPECS) {
      expect(cfg[spec.key]).toBeDefined()
      expect(cfg[spec.key].bonusSections).toEqual([...spec.bonusSections])
    }
    expect(Object.isFrozen(cfg)).toBe(true)
  })

  it('deriveMethodLabelKeys produces a label entry for every spec', () => {
    const labels = deriveMethodLabelKeys()
    for (const spec of ORDERED_METHOD_SPECS) {
      expect(labels[spec.key]).toBe(spec.labelKey)
    }
  })

  it('deriveMethodDescriptionKeys only includes specs that declared a descriptionKey', () => {
    const descs = deriveMethodDescriptionKeys()
    for (const spec of ORDERED_METHOD_SPECS) {
      if (spec.descriptionKey) {
        expect(descs[spec.key]).toBe(spec.descriptionKey)
      } else {
        expect(descs[spec.key]).toBeUndefined()
      }
    }
  })

  it('deriveMutuallyExclusivePairs deduplicates and orders pairs canonically', () => {
    const pairs = deriveMutuallyExclusivePairs()
    const seen = new Set<string>()
    for (const [a, b] of pairs) {
      expect(a < b, `pair [${a}, ${b}] not canonically ordered`).toBe(true)
      const id = `${a}::${b}`
      expect(seen.has(id), `duplicate pair ${id}`).toBe(false)
      seen.add(id)
    }
  })

  it('deriveMutuallyExclusivePairs reflects the documented incompatibilities', () => {
    const pairs = deriveMutuallyExclusivePairs().map(([a, b]) => `${a}::${b}`)
    expect(pairs).toContain('ebitda_multiple::sde_multiple')
    expect(pairs).toContain('omzet_multiple::revenue_multiple')
    expect(pairs).toContain('adjusted_nav::sde_multiple')
  })
})

describe('capability flags', () => {
  it.each(EXPECTED_METHOD_KEYS)('%s declares all five capability flags as booleans', (key) => {
    const spec = METHOD_SPECS[key]
    expect(typeof spec.isAdaptive).toBe('boolean')
    expect(typeof spec.acceptsPreparerMultipleOverride).toBe('boolean')
    expect(typeof spec.requiresVenturePath).toBe('boolean')
    expect(typeof spec.requiresForecastYears).toBe('boolean')
    expect(typeof spec.requiresOwnerCompensation).toBe('boolean')
  })

  it('exactly one spec is the adaptive sentinel', () => {
    const adaptive = ORDERED_METHOD_SPECS.filter((s) => s.isAdaptive)
    expect(adaptive.map((s) => s.key)).toEqual(['upswitch_adaptive'])
  })

  it('only ebitda_multiple and upswitch_adaptive accept the preparer multiple override', () => {
    const accepting = ORDERED_METHOD_SPECS.filter((s) => s.acceptsPreparerMultipleOverride)
    expect(new Set(accepting.map((s) => s.key))).toEqual(
      new Set(['ebitda_multiple', 'upswitch_adaptive'])
    )
  })

  it('only startup_valuation requires the venture path', () => {
    const venture = ORDERED_METHOD_SPECS.filter((s) => s.requiresVenturePath)
    expect(venture.map((s) => s.key)).toEqual(['startup_valuation'])
  })

  it('only dcf requires forecast years', () => {
    const forecast = ORDERED_METHOD_SPECS.filter((s) => s.requiresForecastYears)
    expect(forecast.map((s) => s.key)).toEqual(['dcf'])
  })

  it('only sde_multiple requires owner-compensation input', () => {
    const ownerComp = ORDERED_METHOD_SPECS.filter((s) => s.requiresOwnerCompensation)
    expect(ownerComp.map((s) => s.key)).toEqual(['sde_multiple'])
  })

  it('isAdaptive implies standalone (the adaptive sentinel cannot be blended)', () => {
    for (const spec of ORDERED_METHOD_SPECS) {
      if (spec.isAdaptive) {
        expect(spec.standalone, `${spec.key} isAdaptive but not standalone`).toBe(true)
      }
    }
  })

  it('requiresVenturePath implies standalone (the startup engine is its own path)', () => {
    for (const spec of ORDERED_METHOD_SPECS) {
      if (spec.requiresVenturePath) {
        expect(spec.standalone, `${spec.key} requiresVenturePath but not standalone`).toBe(true)
      }
    }
  })
})

describe('capability helpers', () => {
  it('isAdaptiveMethodKey returns true only for the adaptive sentinel', () => {
    expect(isAdaptiveMethodKey('upswitch_adaptive')).toBe(true)
    expect(isAdaptiveMethodKey('dcf')).toBe(false)
    expect(isAdaptiveMethodKey('startup_valuation')).toBe(false)
    expect(isAdaptiveMethodKey(null)).toBe(false)
    expect(isAdaptiveMethodKey(undefined)).toBe(false)
    expect(isAdaptiveMethodKey('unknown_key')).toBe(false)
  })

  it('isVenturePathMethodKey returns true only for startup_valuation', () => {
    expect(isVenturePathMethodKey('startup_valuation')).toBe(true)
    expect(isVenturePathMethodKey('dcf')).toBe(false)
    expect(isVenturePathMethodKey('upswitch_adaptive')).toBe(false)
    expect(isVenturePathMethodKey(null)).toBe(false)
    expect(isVenturePathMethodKey(undefined)).toBe(false)
  })

  it('methodKeyAcceptsPreparerMultipleOverride returns true for ebitda_multiple and adaptive', () => {
    expect(methodKeyAcceptsPreparerMultipleOverride('ebitda_multiple')).toBe(true)
    expect(methodKeyAcceptsPreparerMultipleOverride('upswitch_adaptive')).toBe(true)
    expect(methodKeyAcceptsPreparerMultipleOverride('dcf')).toBe(false)
    expect(methodKeyAcceptsPreparerMultipleOverride('sde_multiple')).toBe(false)
    expect(methodKeyAcceptsPreparerMultipleOverride(null)).toBe(false)
  })

  it('methodKeyRequiresForecastYears returns true only for dcf', () => {
    expect(methodKeyRequiresForecastYears('dcf')).toBe(true)
    expect(methodKeyRequiresForecastYears('ebitda_multiple')).toBe(false)
    expect(methodKeyRequiresForecastYears('upswitch_adaptive')).toBe(false)
    expect(methodKeyRequiresForecastYears(null)).toBe(false)
  })

  it('selectionRequiresForecastYears returns true iff any method in the selection requires forecasts', () => {
    expect(selectionRequiresForecastYears([])).toBe(false)
    expect(selectionRequiresForecastYears(['ebitda_multiple', 'adjusted_nav'])).toBe(false)
    expect(selectionRequiresForecastYears(['dcf'])).toBe(true)
    expect(selectionRequiresForecastYears(['ebitda_multiple', 'dcf', 'adjusted_nav'])).toBe(true)
    expect(selectionRequiresForecastYears(['unknown_key'])).toBe(false)
  })

  it('selectionRequiresOwnerCompensation returns true iff any method requires owner-comp', () => {
    expect(selectionRequiresOwnerCompensation([])).toBe(false)
    expect(selectionRequiresOwnerCompensation(['ebitda_multiple'])).toBe(false)
    expect(selectionRequiresOwnerCompensation(['sde_multiple'])).toBe(true)
    expect(selectionRequiresOwnerCompensation(['adjusted_nav', 'sde_multiple'])).toBe(true)
    expect(selectionRequiresOwnerCompensation(['unknown_key'])).toBe(false)
  })

  it('selectionAppliesRealEstateCarveOut matches the registry spec flag', () => {
    // True: methods that consume EBITDA or run the EV→Equity bridge.
    expect(selectionAppliesRealEstateCarveOut(['ebitda_multiple'])).toBe(true)
    expect(selectionAppliesRealEstateCarveOut(['dcf'])).toBe(true)
    expect(selectionAppliesRealEstateCarveOut(['sde_multiple'])).toBe(true)
    expect(selectionAppliesRealEstateCarveOut(['upswitch_adaptive'])).toBe(true)
    // False: revenue / regulatory / pre-revenue / wind-down / NAV-own-RE.
    expect(selectionAppliesRealEstateCarveOut(['omzet_multiple'])).toBe(false)
    expect(selectionAppliesRealEstateCarveOut(['arr_multiple'])).toBe(false)
    expect(selectionAppliesRealEstateCarveOut(['revenue_multiple'])).toBe(false)
    expect(selectionAppliesRealEstateCarveOut(['adjusted_nav'])).toBe(false)
    expect(selectionAppliesRealEstateCarveOut(['fiscal_4x'])).toBe(false)
    expect(selectionAppliesRealEstateCarveOut(['startup_valuation'])).toBe(false)
    expect(selectionAppliesRealEstateCarveOut(['liquidation_analysis'])).toBe(false)
    // Mixed: at least one applies.
    expect(selectionAppliesRealEstateCarveOut(['omzet_multiple', 'dcf'])).toBe(true)
    // Empty / null / unknown.
    expect(selectionAppliesRealEstateCarveOut([])).toBe(false)
    expect(selectionAppliesRealEstateCarveOut(null)).toBe(false)
    expect(selectionAppliesRealEstateCarveOut(undefined)).toBe(false)
    expect(selectionAppliesRealEstateCarveOut(['unknown_key'])).toBe(false)
  })
})

describe('legacy contract guarantees', () => {
  it('every combinable method appears in the derived COMBINABLE set', () => {
    const set = deriveCombinableMethods()
    expect(set.has('ebitda_multiple')).toBe(true)
    expect(set.has('dcf')).toBe(true)
    expect(set.has('adjusted_nav')).toBe(true)
    expect(set.has('omzet_multiple')).toBe(true)
    expect(set.has('revenue_multiple')).toBe(true)
    expect(set.has('arr_multiple')).toBe(true)
    expect(set.has('sde_multiple')).toBe(true)
  })

  it('every standalone method appears in the derived STANDALONE set', () => {
    const set = deriveStandaloneMethods()
    expect(set.has('upswitch_adaptive')).toBe(true)
    expect(set.has('fiscal_4x')).toBe(true)
    expect(set.has('startup_valuation')).toBe(true)
    expect(set.has('liquidation_analysis')).toBe(true)
  })

  it('the PRE_SELECTABLE list omits the EN alias revenue_multiple', () => {
    const list = derivePreSelectableMethods()
    expect(list).not.toContain('revenue_multiple')
    expect(list).toContain('omzet_multiple')
  })
})
