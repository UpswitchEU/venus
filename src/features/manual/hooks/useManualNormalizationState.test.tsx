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

const manualPendingItem: NormalizationItem = {
  id: 'manual-rent-2021',
  ledgerCode: '610100',
  ledgerName: 'Rent',
  category: 'rent',
  type: 'add',
  value: 10_000,
  adjustment: 10_000,
  reason: 'Manual correction',
  source: 'manual',
  status: 'pending',
  applyAllYears: false,
  year: 2021,
  confidence: 'medium',
}

const accountingImportPendingItem: NormalizationItem = {
  ...importedPendingItem,
  id: 'yuki-row-610000',
  source: 'yuki',
  sourceRef: 'Yuki',
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

  it('bulk-accepts imported ledger review items and marks them reviewed', () => {
    useNormalizationStore
      .getState()
      .setItems([importedPendingItem, accountingImportPendingItem, manualPendingItem])

    useNormalizationStore.getState().bulkAccept([importedPendingItem.id, manualPendingItem.id])
    useNormalizationStore.getState().bulkAccept([accountingImportPendingItem.id])

    const items = useNormalizationStore.getState().items
    expect(items).toEqual([
      expect.objectContaining({
        id: importedPendingItem.id,
        status: 'accepted',
      }),
      expect.objectContaining({
        id: accountingImportPendingItem.id,
        status: 'accepted',
      }),
      expect.objectContaining({
        id: manualPendingItem.id,
        status: 'accepted',
      }),
    ])
    expect(items[0]?.reviewedAt).toEqual(expect.any(String))
    expect(items[1]?.reviewedAt).toEqual(expect.any(String))
  })
})
