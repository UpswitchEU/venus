import { describe, expect, it } from 'vitest'
import {
  bulkUpdateNormalizationStatus,
  removeSelectedNormalizations,
  updateNormalizationStatus,
} from './UnifiedNormalizationModalActions'
import type { NormalizationItem } from './UnifiedNormalizationTypes'

const baseItem = (overrides: Partial<NormalizationItem>): NormalizationItem => ({
  id: 'manual_1',
  ledgerCode: '610',
  ledgerName: 'Rent',
  category: 'rent',
  type: 'add',
  value: 1000,
  adjustment: 1000,
  source: 'manual',
  status: 'pending',
  applyAllYears: false,
  year: 2025,
  ...overrides,
})

describe('updateNormalizationStatus', () => {
  it('marks individually accepted imported corrections as reviewed', () => {
    const result = updateNormalizationStatus({
      items: [baseItem({ id: 'imported_sde_1', source: 'yuki' })],
      id: 'imported_sde_1',
      status: 'accepted',
      acceptedAt: '2026-06-19T12:00:00.000Z',
    })

    expect(result[0]).toMatchObject({
      status: 'accepted',
      reviewedAt: '2026-06-19T12:00:00.000Z',
    })
  })

  it('clears imported review timestamps when an item is restored or rejected', () => {
    const result = updateNormalizationStatus({
      items: [
        baseItem({
          id: 'imported_sde_1',
          source: 'exact',
          status: 'accepted',
          reviewedAt: '2026-06-19T12:00:00.000Z',
        }),
      ],
      id: 'imported_sde_1',
      status: 'pending',
      acceptedAt: '2026-06-19T12:05:00.000Z',
    })

    expect(result[0]).toMatchObject({ status: 'pending', reviewedAt: undefined })
  })
})

describe('bulkUpdateNormalizationStatus', () => {
  it('does not bulk-accept imported corrections that require row-level review', () => {
    const result = bulkUpdateNormalizationStatus({
      items: [
        baseItem({ id: 'manual_1', source: 'manual' }),
        baseItem({ id: 'imported_sde_1', source: 'yuki' }),
      ],
      selectedIds: new Set(['manual_1', 'imported_sde_1']),
      status: 'accepted',
      acceptedAt: '2026-06-19T12:00:00.000Z',
    })

    expect(result.find((item) => item.id === 'manual_1')).toMatchObject({ status: 'accepted' })
    const importedItem = result.find((item) => item.id === 'imported_sde_1')
    expect(importedItem).toMatchObject({ status: 'pending' })
    expect(importedItem).not.toHaveProperty('reviewedAt')
  })

  it('allows bulk rejection while clearing imported review timestamps', () => {
    const result = bulkUpdateNormalizationStatus({
      items: [
        baseItem({
          id: 'imported_sde_1',
          source: 'silverfin',
          status: 'accepted',
          reviewedAt: '2026-06-19T12:00:00.000Z',
        }),
      ],
      selectedIds: new Set(['imported_sde_1']),
      status: 'rejected',
      acceptedAt: '2026-06-19T12:05:00.000Z',
    })

    expect(result[0]).toMatchObject({ status: 'rejected', reviewedAt: undefined })
  })
})

describe('removeSelectedNormalizations', () => {
  it('removes only selected normalization rows', () => {
    expect(
      removeSelectedNormalizations({
        items: [baseItem({ id: 'a' }), baseItem({ id: 'b' })],
        selectedIds: new Set(['b']),
      }).map((item) => item.id)
    ).toEqual(['a'])
  })
})
