// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { getNormalizationAmountForBase } from '@/utils/normalizationMath'
import { buildManualNormalizationsFromVersionSnapshot } from './manualVersionNormalizationRestore'

describe('manualVersionNormalizationRestore', () => {
  it.each([
    'proposed',
    'pending',
    'unknown',
    null,
  ])('does not accept a restored %s decision', (status) => {
    const [restored] = buildManualNormalizationsFromVersionSnapshot({
      '2025': { adjustments: [{ amount: 250, status }] },
    })
    expect(restored.status).toBe('pending')
  })
  it.each([
    'add_percent',
    'subtract_percent',
    'absolute',
  ])('does not reinterpret an annual amount as a missing %s instruction', (normalization_type) => {
    const [restored] = buildManualNormalizationsFromVersionSnapshot({
      '2025': { adjustments: [{ amount: 250, normalization_type }] },
    })
    expect(restored.type).toBe('add')
    expect(getNormalizationAmountForBase(restored, 1000)).toBe(250)
  })

  it('preserves amounts but treats legacy review status as unknown', () => {
    const result = buildManualNormalizationsFromVersionSnapshot({
      '2025': {
        adjustments: [
          {
            category: 'owner_compensation_adjustment',
            amount: 45_000,
            note: 'Owner salary above market',
            ledger_code: '620',
            ledger_name: 'Remuneration',
            source: 'exact',
            source_ref: 'Exact Online',
            reviewed_at: '2026-06-29T10:00:00.000Z',
            normalization_type: 'add_percent',
            normalization_value: 15,
            confidence: 'high',
          },
          {
            category: 'rent',
            amount: -12_000,
            reason: 'Related-party rent correction',
            ledgerCode: '610',
            ledgerName: 'Rent',
          },
        ],
      },
    })

    expect(result).toEqual([
      {
        id: 'version-2025-0',
        ledgerCode: '620',
        ledgerName: 'Remuneration',
        category: 'salary',
        backendCategory: 'owner_compensation_adjustment',
        type: 'add_percent',
        value: 15,
        adjustment: 45_000,
        reason: 'Owner salary above market',
        source: 'exact',
        sourceRef: 'Exact Online',
        status: 'pending',
        reviewedAt: '2026-06-29T10:00:00.000Z',
        applyAllYears: false,
        year: 2025,
        confidence: 'high',
      },
      {
        id: 'version-2025-1',
        ledgerCode: '610',
        ledgerName: 'Rent',
        category: 'rent',
        backendCategory: 'rent',
        type: 'subtract',
        value: 12_000,
        adjustment: -12_000,
        reason: 'Related-party rent correction',
        source: 'manual',
        sourceRef: undefined,
        status: 'pending',
        applyAllYears: false,
        year: 2025,
      },
    ])
  })

  it.each([
    'nope',
    null,
    false,
    '',
    '0x10',
    '9007199254740993.01',
  ])('rejects corrupt or lossy saved adjustment %j instead of restoring an accepted zero', (amount) => {
    expect(() =>
      buildManualNormalizationsFromVersionSnapshot({
        '2025': { adjustments: [{ amount, status: 'accepted' }] },
      })
    ).toThrow(/Normalization amount/)
  })

  it('preserves IDs, zero, review states, rule and custom adjustments', () => {
    const result = buildManualNormalizationsFromVersionSnapshot({
      '2025': {
        adjustments: [
          { frontend_id: 'one', amount: 0, status: 'accepted', rule_version: 'rent.v1' },
          { frontend_id: 'two', amount: -10, status: 'rejected' },
          { frontend_id: 'three', amount: 30, status: 'pending' },
        ],
        custom_adjustments: [
          { id: 'custom', amount: 5, description: 'Exceptional expense', status: 'pending' },
        ],
      },
    })
    expect(result.map(({ id, adjustment, status }) => ({ id, adjustment, status }))).toEqual([
      { id: 'one', adjustment: 0, status: 'accepted' },
      { id: 'two', adjustment: -10, status: 'rejected' },
      { id: 'three', adjustment: 30, status: 'pending' },
      { id: 'custom', adjustment: 5, status: 'pending' },
    ])
    expect(result[0].ruleVersion).toBe('rent.v1')
    expect(result[3].ledgerName).toBe('Exceptional expense')
  })

  it('rejects duplicate economic IDs within a year', () => {
    expect(() =>
      buildManualNormalizationsFromVersionSnapshot({
        '2025': {
          adjustments: [{ id: 'same', amount: 2 }],
          custom_adjustments: [{ id: 'same', amount: 2 }],
        },
      })
    ).toThrow(/Duplicate normalization/)
  })

  it('returns an empty list for missing or non-object snapshots', () => {
    expect(buildManualNormalizationsFromVersionSnapshot(null)).toEqual([])
    expect(buildManualNormalizationsFromVersionSnapshot([])).toEqual([])
  })
})

it('restores legacy custom deductions without inventing malformed zero adjustments', () => {
  const restored = buildManualNormalizationsFromVersionSnapshot({
    '2025': {
      custom_adjustments: [
        { description: 'Replacement rent', amount: '-0.1' },
        { description: 'Reviewed nil', amount: 0 },
        { description: 'Corrupt value', amount: true },
        { description: 'Missing amount', amount: null },
        { amount: '0x10' },
      ],
    },
  })
  expect(restored.map(({ adjustment, ledgerName }) => ({ adjustment, ledgerName }))).toEqual([
    { adjustment: -0.1, ledgerName: 'Replacement rent' },
    { adjustment: 0, ledgerName: 'Reviewed nil' },
  ])
})
