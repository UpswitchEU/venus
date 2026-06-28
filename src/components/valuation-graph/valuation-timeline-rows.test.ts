// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationResponse, ValuationTimelinePoint } from '@/types/valuation'
import {
  buildHeadlineFallbackRows,
  buildTimelineChartRows,
  resolveTimelineCurrency,
} from './valuation-timeline-rows'

const point = (
  over: Partial<ValuationTimelinePoint> & { fiscal_year: number }
): ValuationTimelinePoint => ({
  equity_low: 80,
  equity_mid: 100,
  equity_high: 120,
  ...over,
})

describe('buildTimelineChartRows', () => {
  it('returns [] for nullish / empty input', () => {
    expect(buildTimelineChartRows(undefined)).toEqual([])
    expect(buildTimelineChartRows(null)).toEqual([])
    expect(buildTimelineChartRows([])).toEqual([])
  })

  it('maps each fiscal year to a Dec-31 anchored row, ascending, parsing string numerics', () => {
    const rows = buildTimelineChartRows([
      point({
        fiscal_year: 2025,
        equity_low: '90',
        equity_mid: '110',
        equity_high: '130',
        methodology_used: 'Adaptive',
      }),
      point({ fiscal_year: 2023 }),
      point({ fiscal_year: 2024 }),
    ])
    expect(rows.map((row) => row.label)).toEqual(['2023', '2024', '2025'])
    expect(rows[0].observedAt).toBe('2023-12-31T00:00:00.000Z')
    const latest = rows[2]
    expect(latest.valueMid).toBe(110)
    expect(latest.rangeLow).toBe(90)
    expect(latest.rangeHigh).toBe(130)
    expect(latest.methodology).toBe('Adaptive')
    expect(latest.source).toBe('valuation_report')
  })

  it('includes forecast years so the full trend is shown', () => {
    const rows = buildTimelineChartRows([
      point({ fiscal_year: 2025, is_forecast: false }),
      point({ fiscal_year: 2026, is_forecast: true }),
    ])
    expect(rows.map((row) => row.label)).toEqual(['2025', '2026'])
  })

  it('carries the forecast flag (actuals false, projection years true)', () => {
    const rows = buildTimelineChartRows([
      point({ fiscal_year: 2023 }),
      point({ fiscal_year: 2024 }),
      point({ fiscal_year: 2025, is_forecast: true }),
    ])
    expect(rows.map((row) => row.isForecast)).toEqual([false, false, true])
  })

  it('dedupes a fiscal year (last entry wins) and drops malformed points', () => {
    const rows = buildTimelineChartRows([
      point({ fiscal_year: 2025, equity_mid: 100 }),
      point({ fiscal_year: 2025, equity_mid: 200 }),
      { fiscal_year: Number.NaN, equity_low: 1, equity_mid: 1, equity_high: 1 },
      point({ fiscal_year: 2024, equity_mid: 'not-a-number' as unknown as number }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].valueMid).toBe(200)
  })
})

describe('buildHeadlineFallbackRows', () => {
  it('returns [] when the result is missing or has no midpoint', () => {
    expect(buildHeadlineFallbackRows(null)).toEqual([])
    expect(buildHeadlineFallbackRows({} as ValuationResponse)).toEqual([])
  })

  it('builds one row anchored to the valuation-date fiscal year', () => {
    const rows = buildHeadlineFallbackRows({
      equity_value_low: 80,
      equity_value_mid: 100,
      equity_value_high: 120,
      valuation_date: '2024-06-15T00:00:00.000Z',
      methodology: 'EBITDA multiple',
    } as unknown as ValuationResponse)
    expect(rows).toHaveLength(1)
    expect(rows[0].observedAt).toBe('2024-12-31T00:00:00.000Z')
    expect(rows[0].valueMid).toBe(100)
    expect(rows[0].rangeLow).toBe(80)
    expect(rows[0].methodology).toBe('EBITDA multiple')
  })
})

describe('resolveTimelineCurrency', () => {
  it('reads the first point currency, else defaults to EUR', () => {
    expect(resolveTimelineCurrency(null)).toBe('EUR')
    expect(resolveTimelineCurrency({} as ValuationResponse)).toBe('EUR')
    expect(
      resolveTimelineCurrency({
        valuation_timeline: [point({ fiscal_year: 2025, currency: 'GBP' })],
      } as unknown as ValuationResponse)
    ).toBe('GBP')
  })

  it('prefers the headline result currency over the engine-hardcoded timeline EUR', () => {
    expect(
      resolveTimelineCurrency({
        currency: 'GBP',
        valuation_timeline: [point({ fiscal_year: 2025, currency: 'EUR' })],
      } as unknown as ValuationResponse)
    ).toBe('GBP')
  })
})
