import {
  type EbitdaNormalization,
  type GetNormalizationResponse,
  NormalizationCategory,
} from '../types/ebitdaNormalization'
import {
  addCustomAdjustmentToNormalization,
  createEbitdaNormalizationTemplate,
  normalizeEbitdaNormalizationResponse,
  removeCustomAdjustmentFromNormalization,
  safeNormalizationNumber,
  updateCustomAdjustmentInNormalization,
  upsertStandardAdjustment,
} from './ebitdaNormalizationStoreModel'

function baseNormalization(overrides: Partial<EbitdaNormalization> = {}): EbitdaNormalization {
  return {
    session_id: 'session-1',
    year: 2024,
    reported_ebitda: 100_000,
    adjustments: [],
    custom_adjustments: [],
    total_adjustments: 0,
    normalized_ebitda: 100_000,
    confidence_score: 'medium',
    ...overrides,
  }
}

describe('ebitdaNormalizationStoreModel', () => {
  it('creates a finite template from invalid reported EBITDA', () => {
    expect(safeNormalizationNumber(Number.NaN)).toBe(0)
    expect(
      createEbitdaNormalizationTemplate({
        sessionId: 'session-1',
        year: 2025,
        reportedEbitda: Number.NaN,
      })
    ).toMatchObject({
      reported_ebitda: 0,
      normalized_ebitda: 0,
      total_adjustments: 0,
    })
  })

  it('upserts standard adjustments and removes empty zero-value rows', () => {
    const withSalary = upsertStandardAdjustment(
      baseNormalization({
        custom_adjustments: [{ id: 'custom-1', description: 'One-off', amount: -5_000 }],
      }),
      NormalizationCategory.OWNER_COMPENSATION,
      20_000,
      'Owner salary'
    )

    expect(withSalary.adjustments).toEqual([
      {
        category: NormalizationCategory.OWNER_COMPENSATION,
        amount: 20_000,
        note: 'Owner salary',
      },
    ])
    expect(withSalary.total_adjustments).toBe(15_000)
    expect(withSalary.normalized_ebitda).toBe(115_000)

    const removed = upsertStandardAdjustment(
      withSalary,
      NormalizationCategory.OWNER_COMPENSATION,
      0,
      ''
    )

    expect(removed.adjustments).toEqual([])
    expect(removed.total_adjustments).toBe(-5_000)
    expect(removed.normalized_ebitda).toBe(95_000)
  })

  it('keeps zero standard adjustments when a note explains the row', () => {
    const next = upsertStandardAdjustment(
      baseNormalization(),
      NormalizationCategory.PERSONAL_EXPENSES,
      0,
      'Reviewed, no adjustment'
    )

    expect(next.adjustments).toEqual([
      {
        category: NormalizationCategory.PERSONAL_EXPENSES,
        amount: 0,
        note: 'Reviewed, no adjustment',
      },
    ])
    expect(next.normalized_ebitda).toBe(100_000)
  })

  it('adds, updates, and removes custom adjustments with one recalculation path', () => {
    const added = addCustomAdjustmentToNormalization(baseNormalization(), {
      id: 'custom-1',
      description: 'Personal travel',
      amount: 7_500,
      note: 'Add back',
    })
    expect(added.total_adjustments).toBe(7_500)
    expect(added.normalized_ebitda).toBe(107_500)

    const updated = updateCustomAdjustmentInNormalization(added, 'custom-1', {
      description: 'Personal travel adjusted',
      amount: Number.NaN,
      note: 'Invalid input becomes zero',
    })
    expect(updated.custom_adjustments[0]).toMatchObject({
      description: 'Personal travel adjusted',
      amount: 0,
      note: 'Invalid input becomes zero',
    })
    expect(updated.normalized_ebitda).toBe(100_000)

    const removed = removeCustomAdjustmentFromNormalization(updated, 'custom-1')
    expect(removed.custom_adjustments).toEqual([])
    expect(removed.total_adjustments).toBe(0)
    expect(removed.normalized_ebitda).toBe(100_000)
  })

  it('normalizes backend responses without trusting invalid numeric fields', () => {
    const normalized = normalizeEbitdaNormalizationResponse(
      {
        id: 'norm-1',
        version_id: null,
        year: 2024,
        reported_ebitda: Number.NaN,
        adjustments: [
          {
            category: NormalizationCategory.OTHER_ADJUSTMENTS,
            amount: 10_000,
          },
        ],
        custom_adjustments: [],
        total_adjustments: Number.NaN,
        normalized_ebitda: Number.NaN,
        confidence_score: 'high',
        market_rate_source: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      } satisfies GetNormalizationResponse,
      'session-1'
    )

    expect(normalized).toMatchObject({
      id: 'norm-1',
      session_id: 'session-1',
      reported_ebitda: 0,
      total_adjustments: 0,
      normalized_ebitda: 0,
      confidence_score: 'high',
      market_rate_source: undefined,
    })
  })
})
