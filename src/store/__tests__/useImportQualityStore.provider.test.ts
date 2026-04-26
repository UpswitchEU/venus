import { beforeEach, describe, expect, it } from 'vitest'
import { type ImportQualityPerYear, useImportQualityStore } from '../useImportQualityStore'

const baseQuality: Record<string, ImportQualityPerYear> = {
  '2025': {
    confidence_score: 0.9,
    audit_flags: [],
    field_provenance: [],
    total_accounts_processed: 1,
    accounts_mapped_directly: 1,
    accounts_fallback: 0,
    accounts_skipped: 0,
  },
}

describe('useImportQualityStore — provider lifecycle', () => {
  beforeEach(() => {
    useImportQualityStore.setState({
      importQuality: null,
      provider: null,
    })
  })

  it('stores provider passed via setImportQuality opts', () => {
    useImportQualityStore.getState().setImportQuality(baseQuality, { provider: 'yuki' })
    expect(useImportQualityStore.getState().provider).toBe('yuki')
  })

  it('clears provider when setImportQuality is called without opts.provider', () => {
    // Establish provider from a previous load.
    useImportQualityStore.getState().setImportQuality(baseQuality, { provider: 'yuki' })
    expect(useImportQualityStore.getState().provider).toBe('yuki')

    // Subsequent load with no provenance — provider must reset, not leak.
    useImportQualityStore.getState().setImportQuality(baseQuality)
    expect(useImportQualityStore.getState().provider).toBeNull()
  })

  it('clears provider when explicit null is passed', () => {
    useImportQualityStore.getState().setImportQuality(baseQuality, { provider: 'yuki' })
    useImportQualityStore.getState().setImportQuality(baseQuality, { provider: null })
    expect(useImportQualityStore.getState().provider).toBeNull()
  })

  it('setProvider updates provider without touching import quality', () => {
    useImportQualityStore.getState().setImportQuality(baseQuality, { provider: 'yuki' })
    const beforeQuality = useImportQualityStore.getState().importQuality
    useImportQualityStore.getState().setProvider('exact')
    expect(useImportQualityStore.getState().provider).toBe('exact')
    expect(useImportQualityStore.getState().importQuality).toBe(beforeQuality)
  })
})
