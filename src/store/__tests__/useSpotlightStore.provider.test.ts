import { beforeEach, describe, expect, it } from 'vitest'
import { useSpotlightStore, type SpotlightImportQuality } from '../useSpotlightStore'

const baseQuality: Record<string, SpotlightImportQuality> = {
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

describe('useSpotlightStore — provider lifecycle', () => {
  beforeEach(() => {
    useSpotlightStore.setState({
      isSpotlightActive: false,
      importQuality: null,
      provider: null,
      orderedFlagDomIds: [],
      resolvedFields: new Set(),
      activeDomId: null,
      showSourcePanel: false,
    })
  })

  it('stores provider passed via setImportQuality opts', () => {
    useSpotlightStore.getState().setImportQuality(baseQuality, { provider: 'yuki' })
    expect(useSpotlightStore.getState().provider).toBe('yuki')
  })

  it('clears provider when setImportQuality is called without opts.provider', () => {
    // Establish provider from a previous load.
    useSpotlightStore.getState().setImportQuality(baseQuality, { provider: 'yuki' })
    expect(useSpotlightStore.getState().provider).toBe('yuki')

    // Subsequent load with no provenance — provider must reset, not leak.
    useSpotlightStore.getState().setImportQuality(baseQuality)
    expect(useSpotlightStore.getState().provider).toBeNull()
  })

  it('clears provider when explicit null is passed', () => {
    useSpotlightStore.getState().setImportQuality(baseQuality, { provider: 'yuki' })
    useSpotlightStore.getState().setImportQuality(baseQuality, { provider: null })
    expect(useSpotlightStore.getState().provider).toBeNull()
  })

  it('setProvider updates provider without touching import quality', () => {
    useSpotlightStore.getState().setImportQuality(baseQuality, { provider: 'yuki' })
    const beforeQuality = useSpotlightStore.getState().importQuality
    useSpotlightStore.getState().setProvider('exact')
    expect(useSpotlightStore.getState().provider).toBe('exact')
    expect(useSpotlightStore.getState().importQuality).toBe(beforeQuality)
  })
})
