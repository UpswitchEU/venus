import { describe, expect, it } from 'vitest'
import { resolveCurrentYearFinancialBasis } from './currentYearFinancialBasis'

describe('resolveCurrentYearFinancialBasis', () => {
  it('uses imported current-year revenue and EBITDA when top-level mirrors are both stale zero', () => {
    expect(
      resolveCurrentYearFinancialBasis({
        currentFiscalYear: 2025,
        currentYearData: { year: 2025, revenue: 11_282_327, ebitda: 1_205_000 },
        topLevelRevenue: 0,
        topLevelEbitda: 0,
      })
    ).toMatchObject({
      revenueInput: 11_282_327,
      ebitdaInput: 1_205_000,
      usedCurrentYearData: true,
      reason: 'stale_top_level_zero',
    })
  })

  it('does not let a stale top-level revenue zero clobber imported current-year revenue', () => {
    expect(
      resolveCurrentYearFinancialBasis({
        currentFiscalYear: 2025,
        currentYearData: { year: 2025, revenue: 11_282_327, ebitda: 1_205_000 },
        topLevelRevenue: 0,
        topLevelEbitda: 1_200_000,
      })
    ).toMatchObject({
      revenueInput: 11_282_327,
      ebitdaInput: 1_200_000,
      usedCurrentYearData: true,
      reason: 'stale_top_level_zero',
    })
  })

  it('does not let a stale top-level EBITDA zero clobber imported current-year EBITDA', () => {
    expect(
      resolveCurrentYearFinancialBasis({
        currentFiscalYear: 2025,
        currentYearData: { year: 2025, revenue: 11_282_327, ebitda: 1_205_000 },
        topLevelRevenue: 11_200_000,
        topLevelEbitda: 0,
      })
    ).toMatchObject({
      revenueInput: 11_200_000,
      ebitdaInput: 1_205_000,
      usedCurrentYearData: true,
      reason: 'stale_top_level_zero',
    })
  })

  it('preserves an explicit break-even EBITDA zero when the current-year row is also zero', () => {
    expect(
      resolveCurrentYearFinancialBasis({
        currentFiscalYear: 2025,
        currentYearData: { year: 2025, revenue: 1_000_000, ebitda: 0 },
        topLevelRevenue: 1_000_000,
        topLevelEbitda: 0,
      })
    ).toMatchObject({
      revenueInput: 1_000_000,
      ebitdaInput: 0,
      usedCurrentYearData: false,
      reason: 'top_level_or_fallback',
    })
  })

  it('does not promote a populated row from a different filing year', () => {
    expect(
      resolveCurrentYearFinancialBasis({
        currentFiscalYear: 2024,
        currentYearData: { year: 2025, revenue: 11_282_327, ebitda: 1_205_000 },
        topLevelRevenue: 0,
        topLevelEbitda: 0,
      })
    ).toMatchObject({
      revenueInput: 0,
      ebitdaInput: 0,
      usedCurrentYearData: false,
      reason: 'top_level_or_fallback',
    })
  })
})
