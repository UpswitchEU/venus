import { describe, expect, it } from 'vitest'
import {
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
    expect(sanitizePreSelectedValuationMethod('omzet_multiple', 'BE', 100_000)).toBe('omzet_multiple')
    expect(sanitizePreSelectedValuationMethod('omzet_multiple', 'BE')).toBe('omzet_multiple')
  })

  it('rejects unknown keys', () => {
    expect(sanitizePreSelectedValuationMethod('not_a_method')).toBeNull()
  })
})

describe('toSessionPreSelectedFieldValue', () => {
  it('stores null for adaptive', () => {
    expect(toSessionPreSelectedFieldValue(null, 'upswitch_adaptive')).toBeNull()
    expect(toSessionPreSelectedFieldValue(null, 'dcf')).toBe('dcf')
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
})
