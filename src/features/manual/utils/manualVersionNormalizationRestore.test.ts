// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildManualNormalizationsFromVersionSnapshot } from './manualVersionNormalizationRestore'

describe('manualVersionNormalizationRestore', () => {
  it('restores version normalization snapshots into accepted normalization items', () => {
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
        status: 'accepted',
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
        sourceRef: 'version',
        status: 'accepted',
        applyAllYears: false,
        year: 2025,
      },
    ])
  })

  it('ignores malformed years and non-array adjustment payloads', () => {
    expect(
      buildManualNormalizationsFromVersionSnapshot({
        nope: { adjustments: [{ amount: 1_000 }] },
        '2025': { adjustments: 'not-array' },
        '2024': { adjustments: [null, { category: 'not-real', amount: 'nope' }] },
      })
    ).toEqual([
      {
        id: 'version-2024-1',
        ledgerCode: '',
        ledgerName: 'not-real',
        category: 'other',
        backendCategory: 'not-real',
        type: 'add',
        value: 0,
        adjustment: 0,
        reason: undefined,
        source: 'manual',
        sourceRef: 'version',
        status: 'accepted',
        applyAllYears: false,
        year: 2024,
      },
    ])
  })

  it('returns an empty list for missing or non-object snapshots', () => {
    expect(buildManualNormalizationsFromVersionSnapshot(null)).toEqual([])
    expect(buildManualNormalizationsFromVersionSnapshot([])).toEqual([])
  })
})
