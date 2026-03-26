import { describe, expect, it } from 'vitest'
import { getCurrentFilingYear } from '../fiscalYear'

/**
 * These helpers mirror the forecast logic in ManualInputPanel.
 * They are extracted here to test the algorithm independently of React state,
 * matching the exact logic used in the onClick and useEffect handlers.
 */

interface YearlyFinancials {
  year: string
  revenue: number
  ebitda: number
  isForecast?: boolean
}

function addForecastYear(yearlyFinancials: YearlyFinancials[]): YearlyFinancials[] {
  const existingYears = yearlyFinancials.map((yf) => Number(yf.year))
  const nextForecastYear = Math.max(...existingYears) + 1
  return [
    ...yearlyFinancials,
    { year: String(nextForecastYear), revenue: 0, ebitda: 0, isForecast: true },
  ]
}

function injectDcfForecastYears(
  yearlyFinancials: YearlyFinancials[],
  count = 3
): YearlyFinancials[] {
  const hasForecast = yearlyFinancials.some((yf) => yf.isForecast)
  if (hasForecast) return yearlyFinancials

  const maxYear = Math.max(...yearlyFinancials.map((yf) => Number(yf.year)))
  const forecastYears = Array.from({ length: count }, (_, i) => ({
    year: String(maxYear + i + 1),
    revenue: 0,
    ebitda: 0,
    isForecast: true as const,
  }))
  return [...yearlyFinancials, ...forecastYears]
}

function removeForecastYears(yearlyFinancials: YearlyFinancials[]): YearlyFinancials[] {
  return yearlyFinancials.filter((yf) => !yf.isForecast)
}

describe('forecast year helpers', () => {
  const baseYear = getCurrentFilingYear(new Date('2026-03-26'))
  const baseFinancials: YearlyFinancials[] = [
    { year: String(baseYear), revenue: 1_000_000, ebitda: 100_000 },
    { year: String(baseYear - 1), revenue: 900_000, ebitda: 90_000 },
    { year: String(baseYear - 2), revenue: 800_000, ebitda: 80_000 },
  ]

  describe('addForecastYear', () => {
    it('adds a single forecast year after the latest existing year', () => {
      const result = addForecastYear(baseFinancials)
      expect(result).toHaveLength(4)
      const added = result[3]
      expect(added.year).toBe(String(baseYear + 1))
      expect(added.isForecast).toBe(true)
      expect(added.revenue).toBe(0)
      expect(added.ebitda).toBe(0)
    })

    it('adds sequential forecast years on multiple clicks', () => {
      let financials = baseFinancials
      financials = addForecastYear(financials)
      financials = addForecastYear(financials)
      expect(financials).toHaveLength(5)
      expect(financials[3].year).toBe(String(baseYear + 1))
      expect(financials[4].year).toBe(String(baseYear + 2))
      expect(financials[3].isForecast).toBe(true)
      expect(financials[4].isForecast).toBe(true)
    })

    it('adds forecast year after the last forecast (not historical) year', () => {
      const withForecast = addForecastYear(baseFinancials)
      const withSecond = addForecastYear(withForecast)
      expect(Number(withSecond[4].year)).toBe(Number(withSecond[3].year) + 1)
    })
  })

  describe('injectDcfForecastYears', () => {
    it('injects 3 forecast years for DCF', () => {
      const result = injectDcfForecastYears(baseFinancials)
      expect(result).toHaveLength(6)
      const forecastYears = result.filter((yf) => yf.isForecast)
      expect(forecastYears).toHaveLength(3)
      expect(forecastYears.map((yf) => yf.year)).toEqual([
        String(baseYear + 1),
        String(baseYear + 2),
        String(baseYear + 3),
      ])
    })

    it('does not double-inject forecast years if they already exist', () => {
      const withForecast = injectDcfForecastYears(baseFinancials)
      const result = injectDcfForecastYears(withForecast)
      expect(result).toHaveLength(6)
      expect(result).toBe(withForecast)
    })

    it('supports configurable count', () => {
      const result = injectDcfForecastYears(baseFinancials, 5)
      const forecastYears = result.filter((yf) => yf.isForecast)
      expect(forecastYears).toHaveLength(5)
    })
  })

  describe('removeForecastYears', () => {
    it('removes all forecast years when switching away from DCF', () => {
      const withForecast = injectDcfForecastYears(baseFinancials)
      const result = removeForecastYears(withForecast)
      expect(result).toHaveLength(3)
      expect(result.every((yf) => !yf.isForecast)).toBe(true)
    })

    it('preserves historical years unchanged', () => {
      const withForecast = injectDcfForecastYears(baseFinancials)
      const result = removeForecastYears(withForecast)
      expect(result).toEqual(baseFinancials)
    })

    it('is a no-op when no forecast years exist', () => {
      const result = removeForecastYears(baseFinancials)
      expect(result).toEqual(baseFinancials)
    })
  })

  describe('getCurrentFilingYear integration', () => {
    it('March 2026: base year is 2024 (books for 2025 not yet closed)', () => {
      expect(getCurrentFilingYear(new Date('2026-03-26'))).toBe(2024)
    })

    it('August 2026: base year is 2025 (books for 2025 closed by July)', () => {
      expect(getCurrentFilingYear(new Date('2026-08-15'))).toBe(2025)
    })

    it('June 30 is still H1 (year-2)', () => {
      expect(getCurrentFilingYear(new Date('2026-06-30'))).toBe(2024)
    })

    it('July 1 is H2 (year-1)', () => {
      expect(getCurrentFilingYear(new Date('2026-07-01'))).toBe(2025)
    })
  })
})
