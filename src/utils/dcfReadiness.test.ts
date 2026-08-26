import { describe, expect, it } from 'vitest'
import { explicitlyRequestsDcf, resolveManualDcfReadiness } from './dcfReadiness'

describe('resolveManualDcfReadiness', () => {
  it('admits the closed basis year and one prior year while rejecting placeholders and forecasts', () => {
    const readiness = resolveManualDcfReadiness({
      yearlyFinancials: [
        { year: '2025', revenue: '€1.000.000', ebitda: '100.000' },
        { year: 2024, revenue: 900_000, ebitda: 100_000 },
        { year: 2024, revenue: 850_000, ebitda: 90_000 },
        { year: 2023, revenue: 0, ebitda: 0 },
        { year: 2022, revenue: 800_000 },
        { year: 2021.5, revenue: 700_000, ebitda: 70_000 },
        { year: 2026, revenue: 1_100_000, ebitda: 110_000, isForecast: true },
      ],
    })

    expect(readiness).toEqual({
      admittedActualYears: [2024, 2025],
      explicitFcffProjectionYears: [],
      missingActualYears: 1,
      ready: false,
    })
  })

  it('admits explicit future FCFF projections with fewer than three actual years', () => {
    const readiness = resolveManualDcfReadiness({
      dcfInputMode: 'fcff_only',
      yearlyFinancials: [
        { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
        { year: 2025, free_cash_flow: 70_000, isForecast: true },
        { year: 2026, free_cash_flow: 0, is_forecast: true },
      ],
    })

    expect(readiness.admittedActualYears).toEqual([2025])
    expect(readiness.explicitFcffProjectionYears).toEqual([2026])
    expect(readiness.ready).toBe(true)
  })

  it('does not let a trailing empty placeholder move the closed basis year', () => {
    const readiness = resolveManualDcfReadiness({
      dcfInputMode: 'fcff_only',
      yearlyFinancials: [
        { year: 2026, revenue: 0, ebitda: 0 },
        { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
        { year: 2026, free_cash_flow: 75_000, isForecast: true },
      ],
    })

    expect(readiness.admittedActualYears).toEqual([2025])
    expect(readiness.explicitFcffProjectionYears).toEqual([2026])
    expect(readiness.ready).toBe(true)
  })

  it('falls back to request-shaped rows for restored sessions', () => {
    const readiness = resolveManualDcfReadiness({
      currentYearData: { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
      historicalYearsData: [
        { year: 2024, revenue: 900_000, ebitda: 90_000 },
        { year: 2023, revenue: 800_000, ebitda: 80_000 },
      ],
    })

    expect(readiness.admittedActualYears).toEqual([2023, 2024, 2025])
    expect(readiness.ready).toBe(true)
  })

  it('rejects restored historical rows that do not precede the closed basis year', () => {
    const readiness = resolveManualDcfReadiness({
      currentYearData: { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
      historicalYearsData: [
        { year: 2025, revenue: 900_000, ebitda: 90_000 },
        { year: 2026, revenue: 1_100_000, ebitda: 110_000 },
        { year: 2024, revenue: 800_000, ebitda: 80_000 },
      ],
    })

    expect(readiness.admittedActualYears).toEqual([2024, 2025])
  })
})

describe('explicitlyRequestsDcf', () => {
  it('recognizes direct, weighted, configured and methodology intent', () => {
    expect(explicitlyRequestsDcf({ selectedMethod: 'dcf' })).toBe(true)
    expect(explicitlyRequestsDcf({ selectedMethods: ['ebitda_multiple', 'DCF'] })).toBe(true)
    expect(explicitlyRequestsDcf({ userWeights: { dcf: 0.2 } })).toBe(true)
    expect(explicitlyRequestsDcf({ userConfiguredDcf: true })).toBe(true)
    expect(explicitlyRequestsDcf({ dcfInputMode: 'fcff_only' })).toBe(true)
    expect(explicitlyRequestsDcf({ exitMultiple: 4.5 })).toBe(true)
    expect(explicitlyRequestsDcf({ discountingConvention: 'year_end' })).toBe(true)
    expect(explicitlyRequestsDcf({ taxShieldProjectionCount: 1 })).toBe(true)
    expect(explicitlyRequestsDcf({ methodology: 'DCF' })).toBe(true)
  })

  it('treats plain Adaptive as a candidate rather than explicit DCF intent', () => {
    expect(
      explicitlyRequestsDcf({
        selectedMethod: 'upswitch_adaptive',
        selectedMethods: ['upswitch_adaptive'],
      })
    ).toBe(false)
  })
})
