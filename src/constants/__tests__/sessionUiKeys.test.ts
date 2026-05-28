import { describe, expect, it } from 'vitest'
import {
  readPreSelectedValuationMethods,
  sanitizePreSelectedValuationMethod,
  sessionHasStoredPreSelectedMethod,
  toSessionPreSelectedFieldValue,
} from '../sessionUiKeys'

describe('sanitizePreSelectedValuationMethod', () => {
  it('returns null for adaptive and empty', () => {
    expect(sanitizePreSelectedValuationMethod('upswitch_adaptive')).toBeNull()
    expect(sanitizePreSelectedValuationMethod('')).toBeNull()
    expect(sanitizePreSelectedValuationMethod(null)).toBeNull()
  })

  it('accepts valid omni keys for BE default firm', () => {
    expect(sanitizePreSelectedValuationMethod('dcf', 'BE')).toBe('dcf')
    expect(sanitizePreSelectedValuationMethod('fiscal_4x', 'BE')).toBe('fiscal_4x')
  })

  it('excludes fiscal_4x for NL firms', () => {
    expect(sanitizePreSelectedValuationMethod('fiscal_4x', 'NL')).toBeNull()
    expect(sanitizePreSelectedValuationMethod('dcf', 'NL')).toBe('dcf')
  })

  it('allows omzet_multiple regardless of revenue value', () => {
    expect(sanitizePreSelectedValuationMethod('omzet_multiple', 'BE', 0)).toBe('omzet_multiple')
    expect(sanitizePreSelectedValuationMethod('omzet_multiple', 'BE', -500)).toBe('omzet_multiple')
    expect(sanitizePreSelectedValuationMethod('omzet_multiple', 'BE', 100_000)).toBe(
      'omzet_multiple'
    )
    expect(sanitizePreSelectedValuationMethod('omzet_multiple', 'BE')).toBe('omzet_multiple')
  })

  it('rejects unknown keys', () => {
    expect(sanitizePreSelectedValuationMethod('not_a_method')).toBeNull()
  })

  /**
   * Owner/founder gating: the standalone `/calculator` always shows the same
   * 3-method nav for sellers/buyers; if Mercury (or a hand-edited URL) sends
   * `?selected_method=dcf` for an owner, the URL seed must NOT escape that
   * nav contract — otherwise the active method would be invisible in the
   * top bar. `ManualLayout` forwards `preSelectableMethodsForNav` (already
   * intersected with `OWNER_FOUNDER_METHOD_KEYS` for non-advisors) as the
   * `allowedMethodsOverride` so all hardening lives in one place.
   */
  describe('allowedMethodsOverride (owner/founder URL gating)', () => {
    const ownerNav = ['upswitch_adaptive', 'arr_multiple', 'startup_valuation'] as const

    it('rejects firm-allowed methods that are NOT in the owner-founder nav', () => {
      expect(sanitizePreSelectedValuationMethod('dcf', 'BE', null, ownerNav)).toBeNull()
      expect(sanitizePreSelectedValuationMethod('ebitda_multiple', 'BE', null, ownerNav)).toBeNull()
      expect(sanitizePreSelectedValuationMethod('fiscal_4x', 'BE', null, ownerNav)).toBeNull()
    })

    it.each([
      'arr_multiple',
      'startup_valuation',
    ])('accepts owner-founder method %s when override is the owner nav', (method) => {
      expect(sanitizePreSelectedValuationMethod(method, 'BE', null, ownerNav)).toBe(method)
    })

    it('still normalizes upswitch_adaptive to null even with the owner override', () => {
      // `upswitch_adaptive` is the AI default — store as `null` so the
      // calculator boots in adaptive mode without a forced method pick.
      expect(
        sanitizePreSelectedValuationMethod('upswitch_adaptive', 'BE', null, ownerNav)
      ).toBeNull()
    })

    it('falls back to the firm-only list when override is null/undefined/empty', () => {
      // Defensive: a stale call site that forgets to pass the override should
      // behave exactly like the legacy three-arg signature. The hook does
      // pass `preSelectableMethodsForNav` for advisors (which equals the
      // firm list because `showFullAdvisorMethodNav=true`), so this branch
      // covers the advisor path implicitly.
      expect(sanitizePreSelectedValuationMethod('dcf', 'BE', null, undefined)).toBe('dcf')
      expect(sanitizePreSelectedValuationMethod('dcf', 'BE', null, null)).toBe('dcf')
      expect(sanitizePreSelectedValuationMethod('dcf', 'BE', null, [])).toBe('dcf')
    })

    it('intersects override with case + trim normalization', () => {
      // Owners might land on `?selected_method=DCF` or `?selected_method=  dcf  `;
      // normalize before checking the allowlist so the gate is robust to
      // accidental query-string casing.
      expect(sanitizePreSelectedValuationMethod('DCF', 'BE', null, ownerNav)).toBeNull()
      expect(sanitizePreSelectedValuationMethod('  ARR_MULTIPLE  ', 'BE', null, ownerNav)).toBe(
        'arr_multiple'
      )
    })
  })
})

describe('toSessionPreSelectedFieldValue', () => {
  it('stores null for adaptive', () => {
    expect(toSessionPreSelectedFieldValue(null, 'upswitch_adaptive')).toBeNull()
    expect(toSessionPreSelectedFieldValue(null, 'dcf')).toBe('dcf')
  })
})

describe('readPreSelectedValuationMethods', () => {
  it('returns string methods from session JSONB and ignores invalid entries', () => {
    expect(
      readPreSelectedValuationMethods({
        _pre_selected_valuation_methods: ['dcf', 42, 'adjusted_nav'],
      })
    ).toEqual(['dcf', 'adjusted_nav'])
  })

  it('returns undefined for missing or empty arrays', () => {
    expect(readPreSelectedValuationMethods({})).toBeUndefined()
    expect(readPreSelectedValuationMethods({ _pre_selected_valuation_methods: [] })).toBeUndefined()
  })
})

describe('sessionHasStoredPreSelectedMethod', () => {
  it('is false for empty or non-objects', () => {
    expect(sessionHasStoredPreSelectedMethod(undefined)).toBe(false)
    expect(sessionHasStoredPreSelectedMethod(null)).toBe(false)
    expect(sessionHasStoredPreSelectedMethod('x')).toBe(false)
  })

  it('detects both canonical and alternate session keys', () => {
    expect(sessionHasStoredPreSelectedMethod({ _pre_selected_valuation_method: 'dcf' })).toBe(true)
    expect(sessionHasStoredPreSelectedMethod({ pre_selected_valuation_method: null })).toBe(true)
    expect(sessionHasStoredPreSelectedMethod({ company_name: 'X' })).toBe(false)
  })

  it('detects multi-method array without legacy single-key (URL seed must not wipe)', () => {
    expect(
      sessionHasStoredPreSelectedMethod({
        _pre_selected_valuation_methods: ['ebitda_multiple', 'adjusted_nav'],
      })
    ).toBe(true)
    expect(sessionHasStoredPreSelectedMethod({ _pre_selected_valuation_methods: [] })).toBe(false)
  })

  it('detects flat snake_case duplicates for multi-array and selected_method', () => {
    expect(
      sessionHasStoredPreSelectedMethod({
        pre_selected_valuation_methods: ['dcf'],
      })
    ).toBe(true)
    expect(sessionHasStoredPreSelectedMethod({ selected_method: 'dcf' })).toBe(true)
    expect(sessionHasStoredPreSelectedMethod({ selected_method: '  ' })).toBe(false)
  })
})
