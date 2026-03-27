import { afterEach, describe, expect, it, vi } from 'vitest'
import { deriveSaasArrProjectionPreview } from './saasArrProjectionPreview'

describe('deriveSaasArrProjectionPreview', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('projects five ARR years from explicit ARR, growth, and NRR', () => {
    const rows = deriveSaasArrProjectionPreview({
      yearlyFinancials: [{ year: '2024' }],
      saasArr: 1_000_000,
      saasArrGrowthPct: 20,
      saasNrrPct: 110,
    })

    expect(rows).toHaveLength(5)
    expect(rows[0]).toEqual({ year: 2025, arr: 1_320_000 })
    expect(rows[4]).toEqual({ year: 2029, arr: 4_007_464 })
  })

  it('falls back to MRR and inferred net retention when NRR is missing', () => {
    const rows = deriveSaasArrProjectionPreview({
      yearlyFinancials: [{ year: '2025' }],
      saasMrr: 50_000,
      saasArrGrowthPct: 10,
      saasChurnPct: 8,
      saasExpansionRevenuePct: 12,
    })

    expect(rows[0]).toEqual({ year: 2026, arr: 686_400 })
    expect(rows).toHaveLength(5)
  })

  it('returns empty without ARR or MRR', () => {
    expect(
      deriveSaasArrProjectionPreview({
        saasArrGrowthPct: 15,
        saasNrrPct: 105,
      })
    ).toEqual([])
  })

  it('uses the filing year when no actual financial years exist', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    const rows = deriveSaasArrProjectionPreview({
      saasArr: 1_000_000,
      saasArrGrowthPct: 10,
      saasNrrPct: 100,
      projectionYears: 2,
    })

    expect(rows).toEqual([
      { year: 2025, arr: 1_100_000 },
      { year: 2026, arr: 1_210_000 },
    ])
  })
})
