import {
  type EbitdaNormalization,
  type GetNormalizationResponse,
  NormalizationCategory,
} from '../types/ebitdaNormalization'
import {
  addCustomAdjustmentToNormalization,
  createEbitdaNormalizationTemplate,
  deriveMarketRateSuggestions,
  getEbitdaNormalizationAdjustmentCount,
  getEbitdaNormalizationAdjustmentPercentage,
  getEbitdaNormalizationLastUpdated,
  getEbitdaNormalizationNormalizedEbitda,
  getEbitdaNormalizationTotalAdjustments,
  hasEbitdaNormalization,
  isNormalizationSaveInFlight,
  isVirginEbitdaNormalization,
  mergeLoadedEbitdaNormalizations,
  nextPendingNormalizationSaveCount,
  normalizeEbitdaNormalizationResponse,
  removeCustomAdjustmentFromNormalization,
  runWithNormalizationConflictRetry,
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

  it('treats empty optimistic templates as replaceable server-load placeholders', () => {
    expect(isVirginEbitdaNormalization(baseNormalization())).toBe(true)
    expect(
      isVirginEbitdaNormalization(
        baseNormalization({
          id: 'norm-1',
        })
      )
    ).toBe(false)
    expect(
      isVirginEbitdaNormalization(
        baseNormalization({
          adjustments: [{ category: NormalizationCategory.OTHER_ADJUSTMENTS, amount: 1 }],
        })
      )
    ).toBe(false)
  })

  it('merges loaded normalizations without overwriting local edits from late responses', () => {
    const localEdited = baseNormalization({
      adjustments: [{ category: NormalizationCategory.OWNER_COMPENSATION, amount: 25_000 }],
    })
    const loaded2024 = baseNormalization({ id: 'server-2024', normalized_ebitda: 90_000 })
    const loaded2023 = baseNormalization({
      id: 'server-2023',
      year: 2023,
      normalized_ebitda: 80_000,
    })

    expect(
      mergeLoadedEbitdaNormalizations(
        {
          2024: localEdited,
        },
        {
          2024: loaded2024,
          2023: loaded2023,
        }
      )
    ).toEqual({
      2024: localEdited,
      2023: loaded2023,
    })
  })

  it('tracks overlapping save operations without dropping the saving flag early', () => {
    let pendingCount = 0

    pendingCount = nextPendingNormalizationSaveCount(pendingCount, 1)
    expect(isNormalizationSaveInFlight(pendingCount)).toBe(true)

    pendingCount = nextPendingNormalizationSaveCount(pendingCount, 1)
    expect(isNormalizationSaveInFlight(pendingCount)).toBe(true)

    pendingCount = nextPendingNormalizationSaveCount(pendingCount, -1)
    expect(pendingCount).toBe(1)
    expect(isNormalizationSaveInFlight(pendingCount)).toBe(true)

    pendingCount = nextPendingNormalizationSaveCount(pendingCount, -1)
    expect(pendingCount).toBe(0)
    expect(isNormalizationSaveInFlight(pendingCount)).toBe(false)
  })

  it('retries normalization mutations on 409 conflicts only', async () => {
    const sleeps: number[] = []
    let attempts = 0

    await expect(
      runWithNormalizationConflictRetry(
        async () => {
          attempts += 1
          if (attempts < 3) {
            throw { status: 409 }
          }
          return 'ok'
        },
        {
          retryDelaysMs: [5, 10],
          sleep: async (delayMs) => {
            sleeps.push(delayMs)
          },
        }
      )
    ).resolves.toBe('ok')

    expect(attempts).toBe(3)
    expect(sleeps).toEqual([5, 10])
  })

  it('does not retry non-conflict normalization mutation failures', async () => {
    let attempts = 0
    await expect(
      runWithNormalizationConflictRetry(
        async () => {
          attempts += 1
          throw { status: 500 }
        },
        {
          retryDelaysMs: [5, 10],
          sleep: async () => undefined,
        }
      )
    ).rejects.toThrow('Normalization mutation failed')

    expect(attempts).toBe(1)
  })

  it('derives market-rate suggestions from finite revenue percentages', () => {
    expect(
      deriveMarketRateSuggestions(
        {
          confidence: 'high',
          discretionary_expenses_suggested_percentage: 2.5,
          industry: 'software',
          location: 'Belgium',
          owner_compensation_market_rate: 120_000,
          owner_compensation_percentile_50: 110_000,
          owner_compensation_percentile_75: 140_000,
          personal_expenses_suggested_percentage: 1.25,
          source: 'market-db',
        },
        'software',
        2_000_000
      )
    ).toEqual([
      {
        category: NormalizationCategory.OWNER_COMPENSATION,
        confidence: 'high',
        market_rate_50th_percentile: 110_000,
        market_rate_75th_percentile: 140_000,
        rationale: 'Market rate for CEO/owner in software with €2000k revenue',
        source: 'market-db',
        suggested_amount: 120_000,
      },
      {
        category: NormalizationCategory.PERSONAL_EXPENSES,
        confidence: 'high',
        rationale: 'Typical personal expenses: 1.25% of revenue',
        source: 'market-db',
        suggested_amount: 25_000,
        suggested_percentage: 1.25,
      },
      {
        category: NormalizationCategory.DISCRETIONARY_EXPENSES,
        confidence: 'high',
        rationale: 'Typical discretionary expenses: 2.5% of revenue',
        source: 'market-db',
        suggested_amount: 50_000,
        suggested_percentage: 2.5,
      },
    ])
  })

  it('does not derive percentage market-rate suggestions from invalid or zero revenue', () => {
    expect(
      deriveMarketRateSuggestions(
        {
          confidence: 'medium',
          discretionary_expenses_suggested_percentage: 2,
          industry: 'software',
          location: 'Belgium',
          personal_expenses_suggested_percentage: 1,
        },
        'software',
        Number.NaN
      )
    ).toEqual([])
  })

  it('derives legacy-store computed values without depending on Zustand', () => {
    const normalization = baseNormalization({
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      adjustments: [
        { category: NormalizationCategory.OWNER_COMPENSATION, amount: 15_000 },
        { category: NormalizationCategory.PERSONAL_EXPENSES, amount: 0 },
      ],
      custom_adjustments: [{ id: 'custom-1', description: 'One-off', amount: -5_000 }],
      total_adjustments: 10_000,
      normalized_ebitda: 110_000,
    })

    expect(getEbitdaNormalizationTotalAdjustments(normalization)).toBe(10_000)
    expect(getEbitdaNormalizationNormalizedEbitda(normalization)).toBe(110_000)
    expect(hasEbitdaNormalization(normalization)).toBe(true)
    expect(getEbitdaNormalizationAdjustmentPercentage(normalization)).toBe(10)
    expect(getEbitdaNormalizationAdjustmentCount(normalization)).toBe(2)
    expect(getEbitdaNormalizationLastUpdated(normalization).toISOString()).toBe(
      '2026-01-02T00:00:00.000Z'
    )
  })

  it('keeps computed values safe for empty or invalid normalization state', () => {
    const fallback = new Date('2026-01-03T00:00:00.000Z')

    expect(getEbitdaNormalizationTotalAdjustments(undefined)).toBe(0)
    expect(getEbitdaNormalizationNormalizedEbitda(undefined)).toBe(0)
    expect(hasEbitdaNormalization(undefined)).toBe(false)
    expect(
      getEbitdaNormalizationAdjustmentPercentage(baseNormalization({ reported_ebitda: 0 }))
    ).toBe(0)
    expect(getEbitdaNormalizationAdjustmentCount(undefined)).toBe(0)
    expect(
      getEbitdaNormalizationLastUpdated(baseNormalization({ updated_at: 'not-a-date' }), fallback)
    ).toBe(fallback)
  })
})
