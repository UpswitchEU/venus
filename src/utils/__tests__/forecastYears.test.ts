import { describe, expect, it } from 'vitest'
import { getCurrentFilingYear } from '../fiscalYear'
import {
  appendManualForecastYear,
  buildEmptyForecastYears,
  canAppendForecastYear,
  canAppendHistoricalYear,
  dcfInjectionAddedRowCount,
  DEFAULT_DCF_FORECAST_YEAR_COUNT,
  injectDefaultDcfForecastYears,
  MAX_FISCAL_YEAR,
  MAX_FORECAST_YEAR_COUNT,
  MIN_FISCAL_YEAR,
  canRemoveHistoricalYear,
  removeForecastYear,
  removeForecastYears,
  removeHistoricalYear,
} from '../forecastYears'

interface YearlyFinancials {
  year: string
  revenue: number
  ebitda: number
  isForecast?: boolean
}

function addForecastYear(yearlyFinancials: YearlyFinancials[]): YearlyFinancials[] {
  const result = appendManualForecastYear(yearlyFinancials)
  if (!result.ok) return yearlyFinancials
  return result.yearlyFinancials as YearlyFinancials[]
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
    it('injects the shared default forecast horizon for DCF', () => {
      const result = injectDefaultDcfForecastYears(baseFinancials)
      expect(result).toHaveLength(baseFinancials.length + DEFAULT_DCF_FORECAST_YEAR_COUNT)
      const forecastYears = result.filter((yf) => yf.isForecast)
      expect(forecastYears).toHaveLength(DEFAULT_DCF_FORECAST_YEAR_COUNT)
      expect(forecastYears.map((yf) => yf.year)).toEqual([
        String(baseYear + 1),
        String(baseYear + 2),
        String(baseYear + 3),
        String(baseYear + 4),
        String(baseYear + 5),
      ])
    })

    it('does not double-inject forecast years if they already exist', () => {
      const withForecast = injectDefaultDcfForecastYears(baseFinancials)
      const result = injectDefaultDcfForecastYears(withForecast)
      expect(result).toHaveLength(baseFinancials.length + DEFAULT_DCF_FORECAST_YEAR_COUNT)
      expect(result).toBe(withForecast)
    })

    it('uses the same five-year horizon as the valuation engine default', () => {
      expect(DEFAULT_DCF_FORECAST_YEAR_COUNT).toBe(5)
    })
  })

  describe('removeForecastYears', () => {
    it('removes all forecast years when switching away from DCF', () => {
      const withForecast = injectDefaultDcfForecastYears(baseFinancials)
      const result = removeForecastYears(withForecast)
      expect(result).toHaveLength(3)
      expect(result.every((yf) => !yf.isForecast)).toBe(true)
    })

    it('preserves historical years unchanged', () => {
      const withForecast = injectDefaultDcfForecastYears(baseFinancials)
      const result = removeForecastYears(withForecast)
      expect(result).toEqual(baseFinancials)
    })

    it('is a no-op when no forecast years exist', () => {
      const result = removeForecastYears(baseFinancials)
      expect(result).toEqual(baseFinancials)
    })
  })

  describe('removeForecastYear', () => {
    it('removes only the selected forecast year and keeps the remaining horizon intact', () => {
      const withForecasts = injectDefaultDcfForecastYears(baseFinancials)
      const result = removeForecastYear(withForecasts, String(baseYear + 2))

      expect(result.filter((yf) => yf.isForecast).map((yf) => yf.year)).toEqual([
        String(baseYear + 1),
        String(baseYear + 3),
        String(baseYear + 4),
        String(baseYear + 5),
      ])
      expect(result.filter((yf) => !yf.isForecast)).toEqual(baseFinancials)
    })

    it('matches year with String coercion for stable removal', () => {
      const rows: YearlyFinancials[] = [
        { year: '2026', revenue: 1, ebitda: 1, isForecast: true },
      ]
      expect(removeForecastYear(rows, '2026')).toHaveLength(0)
      const numericYear = [{ ...rows[0], year: 2026 as unknown as string }]
      expect(removeForecastYear(numericYear, '2026')).toHaveLength(0)
    })
  })

  describe('appendManualForecastYear', () => {
    it('rejects when forecast year would exceed fiscal max', () => {
      const atMax: YearlyFinancials[] = [
        { year: String(MAX_FISCAL_YEAR), revenue: 0, ebitda: 0, isForecast: true },
      ]
      const result = appendManualForecastYear(atMax)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('year_out_of_range')
    })

    it('allows adding up to the last valid fiscal year', () => {
      const result = appendManualForecastYear([
        { year: String(MAX_FISCAL_YEAR - 1), revenue: 1, ebitda: 1, isForecast: true },
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.yearlyFinancials[result.yearlyFinancials.length - 1].year).toBe(
          String(MAX_FISCAL_YEAR)
        )
      }
    })
  })

  describe('buildEmptyForecastYears', () => {
    it('stops at MAX_FISCAL_YEAR when requested horizon spans past it', () => {
      const rows = buildEmptyForecastYears(MAX_FISCAL_YEAR - 1, DEFAULT_DCF_FORECAST_YEAR_COUNT)
      expect(rows.map((r) => r.year)).toEqual([String(MAX_FISCAL_YEAR - 1), String(MAX_FISCAL_YEAR)])
    })
  })

  describe('injectDefaultDcfForecastYears near fiscal max', () => {
    it('injects only years that fit before MAX_FISCAL_YEAR', () => {
      const historicalOnly: YearlyFinancials[] = [
        { year: String(MAX_FISCAL_YEAR - 3), revenue: 1, ebitda: 1 },
      ]
      const result = injectDefaultDcfForecastYears(historicalOnly)
      const forecast = result.filter((yf) => yf.isForecast)
      expect(forecast.map((yf) => yf.year)).toEqual([
        String(MAX_FISCAL_YEAR - 2),
        String(MAX_FISCAL_YEAR - 1),
        String(MAX_FISCAL_YEAR),
      ])
    })

    it('array length delta equals forecast rows added (matches DCF toast count)', () => {
      const historicalOnly: YearlyFinancials[] = [
        { year: String(MAX_FISCAL_YEAR - 3), revenue: 1, ebitda: 1 },
      ]
      const result = injectDefaultDcfForecastYears(historicalOnly)
      const added = dcfInjectionAddedRowCount(historicalOnly, result)
      const forecastCount = result.filter((yf) => yf.isForecast).length
      expect(added).toBe(forecastCount)
      expect(added).toBe(3)
    })

    it('returns the same reference when next forecast year is past MAX_FISCAL_YEAR', () => {
      const onlyMaxYear: YearlyFinancials[] = [
        { year: String(MAX_FISCAL_YEAR), revenue: 1, ebitda: 1 },
      ]
      const result = injectDefaultDcfForecastYears(onlyMaxYear)
      expect(result).toBe(onlyMaxYear)
      expect(dcfInjectionAddedRowCount(onlyMaxYear, result)).toBe(0)
    })
  })

  describe('dcfInjectionAddedRowCount', () => {
    it('is zero when injection returns the same array reference', () => {
      const rows: YearlyFinancials[] = [{ year: '2024', revenue: 1, ebitda: 1 }]
      expect(dcfInjectionAddedRowCount(rows, rows)).toBe(0)
    })
  })

  describe('canAppendForecastYear', () => {
    it('is false at max forecast rows', () => {
      const five: YearlyFinancials[] = Array.from({ length: MAX_FORECAST_YEAR_COUNT }, (_, i) => ({
        year: String(2020 + i),
        revenue: 0,
        ebitda: 0,
        isForecast: true,
      }))
      expect(canAppendForecastYear(five)).toBe(false)
    })
  })

  describe('canAppendHistoricalYear', () => {
    it('is false when the next older year would be before MIN_FISCAL_YEAR', () => {
      const oldestAtFloor: YearlyFinancials[] = [
        { year: String(MIN_FISCAL_YEAR), revenue: 1, ebitda: 1 },
        { year: String(MIN_FISCAL_YEAR + 1), revenue: 1, ebitda: 1 },
      ]
      expect(canAppendHistoricalYear(oldestAtFloor)).toBe(false)
    })

    it('is true when an older year within bounds can be added', () => {
      const rows: YearlyFinancials[] = [{ year: String(MIN_FISCAL_YEAR + 1), revenue: 1, ebitda: 1 }]
      expect(canAppendHistoricalYear(rows)).toBe(true)
    })
  })

  describe('getCurrentFilingYear integration', () => {
    it('March 2026: base year is 2024 (books for 2025 not yet closed)', () => {
      expect(getCurrentFilingYear(new Date('2026-03-26'))).toBe(2024)
    })

    it('April 2026: base year is 2025 once the cutoff has passed', () => {
      expect(getCurrentFilingYear(new Date('2026-04-01'))).toBe(2025)
    })

    it('March 31 is still pre-cutoff (year-2)', () => {
      expect(getCurrentFilingYear(new Date('2026-03-31'))).toBe(2024)
    })

    it('April 1 switches to year-1', () => {
      expect(getCurrentFilingYear(new Date('2026-04-01'))).toBe(2025)
    })
  })

  describe('removeHistoricalYear / canRemoveHistoricalYear', () => {
    it('canRemoveHistoricalYear is false with only one historical row', () => {
      const rows: YearlyFinancials[] = [{ year: '2024', revenue: 0, ebitda: 0 }]
      expect(canRemoveHistoricalYear(rows)).toBe(false)
    })

    it('canRemoveHistoricalYear is true with two historical rows', () => {
      const rows: YearlyFinancials[] = [
        { year: '2024', revenue: 0, ebitda: 0 },
        { year: '2023', revenue: 0, ebitda: 0 },
      ]
      expect(canRemoveHistoricalYear(rows)).toBe(true)
    })

    it('removeHistoricalYear drops one non-forecast row by year string', () => {
      const rows: YearlyFinancials[] = [
        { year: '2024', revenue: 1, ebitda: 1 },
        { year: '2023', revenue: 1, ebitda: 1 },
        { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
      ]
      const next = removeHistoricalYear(rows, '2023')
      expect(next).toHaveLength(2)
      expect(next.map((r) => r.year)).toEqual(['2024', '2025'])
      expect(next[1].isForecast).toBe(true)
    })

    it('removeHistoricalYear does not remove forecast rows with the same year string', () => {
      const rows: YearlyFinancials[] = [
        { year: '2024', revenue: 0, ebitda: 0 },
        { year: '2025', revenue: 0, ebitda: 0, isForecast: true },
      ]
      const next = removeHistoricalYear(rows, '2025')
      expect(next).toHaveLength(2)
    })
  })
})
