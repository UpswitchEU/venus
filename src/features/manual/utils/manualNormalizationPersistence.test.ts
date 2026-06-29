// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildAcceptedNormalizationSignature,
  buildManualNormalizationPersistenceYears,
  getManualNormalizationYearsToPersist,
} from './manualNormalizationPersistence'

describe('manualNormalizationPersistence', () => {
  it('chooses apply-all, explicit apply years, or item year for persistence', () => {
    expect(
      getManualNormalizationYearsToPersist({ year: 2025, applyAllYears: true }, [2023, 2024, 2025])
    ).toEqual([2023, 2024, 2025])
    expect(
      getManualNormalizationYearsToPersist({ year: 2025, applyYears: [2024, 2025] }, [2023])
    ).toEqual([2024, 2025])
    expect(getManualNormalizationYearsToPersist({ year: 2025 }, [2023])).toEqual([2025])
  })

  it('signatures accepted normalization state in deterministic id order', () => {
    expect(
      buildAcceptedNormalizationSignature([
        {
          id: 'b',
          category: 'salary',
          source: 'manual',
          type: 'add',
          status: 'accepted',
          year: 2025,
          value: 2,
          adjustment: 20,
        },
        {
          id: 'pending',
          category: 'other',
          source: 'manual',
          type: 'add',
          status: 'pending',
          year: 2025,
          value: 9,
          adjustment: 90,
        },
        {
          id: 'a',
          category: 'rent',
          source: 'manual',
          type: 'add',
          status: 'accepted',
          year: 2024,
          value: 1,
          adjustment: 10,
          applyYears: [2024],
        },
      ])
    ).toBe(
      '[{"id":"a","category":"rent","type":"add","value":1,"adjustment":10,"year":2024,"source":"manual","applyYears":[2024]},{"id":"b","category":"salary","type":"add","value":2,"adjustment":20,"year":2025,"source":"manual","applyYears":[]}]'
    )
  })

  it('signatures review and report-copy fields that affect imported normalization application', () => {
    const base = {
      id: 'imported_sde_2025_610000_0',
      category: 'other' as const,
      source: 'auto' as const,
      type: 'add' as const,
      status: 'accepted' as const,
      year: 2025,
      value: 221_500,
      adjustment: 221_500,
      ledgerCode: '610000',
      ledgerName: 'Services et biens divers',
      reason: 'Benchmark excess.',
    }

    expect(buildAcceptedNormalizationSignature([base])).not.toBe(
      buildAcceptedNormalizationSignature([
        {
          ...base,
          reason: 'Reviewed benchmark excess.',
          reviewedAt: '2026-06-29T10:00:00.000Z',
        },
      ])
    )
  })

  it('builds a unique finite year set across previous and next items', () => {
    expect(
      buildManualNormalizationPersistenceYears({
        financialYears: [2025, 2024],
        previousItems: [{ year: 2023 }, { year: Number.NaN }],
        nextItems: [
          { year: 2022, applyAllYears: true },
          { year: 2021, applyYears: [2020, 2024] },
        ],
      })
    ).toEqual([2025, 2024, 2023, 2020])
  })
})
