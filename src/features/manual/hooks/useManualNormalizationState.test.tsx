import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { NormalizationItem } from '../../../components/calculator'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useManualNormalizationState } from './useManualNormalizationState'

const importedPendingItem: NormalizationItem = {
  id: 'imported_sde_2021_610000_0',
  ledgerCode: '610000',
  ledgerName: 'Services and other goods',
  category: 'other',
  type: 'add',
  value: 200_000,
  adjustment: 159_500,
  reason: 'Benchmark excess requires review.',
  source: 'auto',
  sourceRef: '2021:610000',
  status: 'pending',
  applyAllYears: false,
  year: 2021,
  confidence: 'high',
}

describe('useManualNormalizationState', () => {
  beforeEach(() => {
    useNormalizationStore.getState().clear()
  })

  it('keeps imported ledger review items pending until the advisor accepts them', () => {
    useNormalizationStore.getState().setItems([importedPendingItem])

    const { result } = renderHook(() =>
      useManualNormalizationState({
        hasImportQuality: true,
      })
    )

    expect(result.current.pendingNormalizationCount).toBe(1)
    expect(result.current.normalizationItems[0]).toMatchObject({
      id: importedPendingItem.id,
      status: 'pending',
    })
  })

  it('marks imported ledger items as reviewed when accepted by a store action', () => {
    useNormalizationStore.getState().setItems([importedPendingItem])

    useNormalizationStore.getState().acceptItem(importedPendingItem.id)

    const accepted = useNormalizationStore.getState().items[0]
    expect(accepted.status).toBe('accepted')
    expect(accepted.reviewedAt).toEqual(expect.any(String))

    useNormalizationStore.getState().rejectItem(importedPendingItem.id)

    const rejected = useNormalizationStore.getState().items[0]
    expect(rejected.status).toBe('rejected')
    expect(rejected.reviewedAt).toBeUndefined()
  })
})
