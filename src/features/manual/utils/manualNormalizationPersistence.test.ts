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
          type: 'custom',
          status: 'accepted',
          year: 2025,
          value: 2,
          adjustment: 20,
        },
        {
          id: 'pending',
          type: 'custom',
          status: 'pending',
          year: 2025,
          value: 9,
          adjustment: 90,
        },
        {
          id: 'a',
          type: 'custom',
          status: 'accepted',
          year: 2024,
          value: 1,
          adjustment: 10,
          applyYears: [2024],
        },
      ])
    ).toBe(
      '[{"id":"a","type":"custom","value":1,"adjustment":10,"year":2024,"applyYears":[2024]},{"id":"b","type":"custom","value":2,"adjustment":20,"year":2025,"applyYears":[]}]'
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
