import { describe, expect, it } from 'vitest'
import { PREFILL_SOURCE_ACCOUNTING_INTEGRATION } from '../lib/bootstrap/types'
import { shouldPreferIntegrationEntry } from './shouldPreferIntegrationEntry'

describe('shouldPreferIntegrationEntry', () => {
  it('uses the same prefill source string as Titan buildPrefill (sources.push)', () => {
    expect(PREFILL_SOURCE_ACCOUNTING_INTEGRATION).toBe('accounting_integration')
  })

  it('is true when spotlight has import quality', () => {
    expect(shouldPreferIntegrationEntry(true, [])).toBe(true)
    expect(shouldPreferIntegrationEntry(true, undefined)).toBe(true)
    expect(shouldPreferIntegrationEntry(true, ['session'])).toBe(true)
  })

  it('is true when prefill includes accounting_integration', () => {
    expect(shouldPreferIntegrationEntry(false, [PREFILL_SOURCE_ACCOUNTING_INTEGRATION])).toBe(true)
    expect(
      shouldPreferIntegrationEntry(false, ['session', PREFILL_SOURCE_ACCOUNTING_INTEGRATION, 'kbo'])
    ).toBe(true)
  })

  it('works with a readonly / frozen sources array', () => {
    const sources = Object.freeze([PREFILL_SOURCE_ACCOUNTING_INTEGRATION] as const)
    expect(shouldPreferIntegrationEntry(false, sources)).toBe(true)
  })

  it('is false when neither import quality nor accounting prefill', () => {
    expect(shouldPreferIntegrationEntry(false, [])).toBe(false)
    expect(shouldPreferIntegrationEntry(false, ['session', 'kbo', 'mercury'])).toBe(false)
  })

  it('treats null/undefined prefill sources as empty', () => {
    expect(shouldPreferIntegrationEntry(false, undefined)).toBe(false)
    expect(shouldPreferIntegrationEntry(false, null)).toBe(false)
  })
})
