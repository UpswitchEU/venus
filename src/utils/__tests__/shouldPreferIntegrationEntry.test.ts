import { describe, expect, it } from 'vitest'
import { PREFILL_SOURCE_ACCOUNTING_INTEGRATION } from '@/lib/bootstrap/types'
import { shouldPreferIntegrationEntry } from '../shouldPreferIntegrationEntry'

describe('shouldPreferIntegrationEntry', () => {
  it('matches Titan bootstrap wire literal for accounting integration', () => {
    expect(PREFILL_SOURCE_ACCOUNTING_INTEGRATION).toBe('accounting_integration')
  })

  it('returns true when import-quality signals exist regardless of sources', () => {
    expect(shouldPreferIntegrationEntry(true, [])).toBe(true)
    expect(shouldPreferIntegrationEntry(true, null)).toBe(true)
  })

  it('returns true when prefillSources includes accounting_integration', () => {
    expect(
      shouldPreferIntegrationEntry(false, ['kbo', PREFILL_SOURCE_ACCOUNTING_INTEGRATION])
    ).toBe(true)
  })

  it('returns false for manual-only dossier prefill without import-quality', () => {
    expect(shouldPreferIntegrationEntry(false, ['kbo', 'session'])).toBe(false)
    expect(shouldPreferIntegrationEntry(false, null)).toBe(false)
  })

  it('handles readonly frozen sources tuples', () => {
    expect(shouldPreferIntegrationEntry(false, Object.freeze(['accounting_integration']))).toBe(
      true
    )
  })

  it('tolerates stray whitespace around source tags', () => {
    expect(shouldPreferIntegrationEntry(false, ['  accounting_integration  '])).toBe(true)
  })
})
