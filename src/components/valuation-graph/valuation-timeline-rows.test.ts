// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationResponse, ValuationTimelinePoint } from '@/types/valuation'
import {
  buildHeadlineFallbackRows,
  buildTimelineChartRows,
  buildValuationCurveRows,
  resolveTimelineCurrency,
  shouldSuppressForecastTimelineRowsForDcf,
  valuationTimelineHasForecastRows,
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

  it('recognizes serialized forecast/projection markers from drifted report payloads', () => {
    const timeline = [
      point({ fiscal_year: 2023, is_forecast: 'false' as unknown as boolean }),
      point({ fiscal_year: 2024, is_forecast: 'true' as unknown as boolean }),
      {
        fiscal_year: 2025,
        equity_low: 80,
        equity_mid: 100,
        equity_high: 120,
        isProjection: 1,
      } as unknown as ValuationTimelinePoint,
      {
        fiscal_year: 2026,
        equity_low: 80,
        equity_mid: 100,
        equity_high: 120,
        period_type: 'prognosis',
      } as unknown as ValuationTimelinePoint,
    ]

    expect(valuationTimelineHasForecastRows(timeline)).toBe(true)
    expect(buildTimelineChartRows(timeline).map((row) => row.isForecast)).toEqual([
      false,
      true,
      true,
      true,
    ])
  })

  it('dedupes a fiscal year (last entry wins) and drops malformed points', () => {
    const rows = buildTimelineChartRows([
      point({ fiscal_year: '2024' as unknown as number, equity_mid: 150 }),
      point({ fiscal_year: 2025, equity_mid: 100 }),
      point({ fiscal_year: 2025, equity_mid: 200 }),
      { fiscal_year: Number.NaN, equity_low: 1, equity_mid: 1, equity_high: 1 },
      point({ fiscal_year: 2026.7, equity_mid: 300 }),
      point({ fiscal_year: 'FY2023' as unknown as number, equity_mid: 400 }),
      point({ fiscal_year: 2024, equity_mid: 'not-a-number' as unknown as number }),
    ])
    expect(rows.map((row) => row.label)).toEqual(['2024', '2025'])
    expect(rows.map((row) => row.valueMid)).toEqual([150, 200])
  })
})

describe('buildValuationCurveRows', () => {
  it('suppresses projected valuation snapshots for DCF-led reports', () => {
    const result = {
      selected_valuation_method: 'dcf',
      dcf_valuation: { enterprise_value: 586_761 },
      valuation_timeline: [
        point({ fiscal_year: 2024, equity_mid: 378_675 }),
        point({ fiscal_year: 2025, equity_mid: 586_761 }),
        point({ fiscal_year: 2026, equity_mid: 457_449, is_forecast: true }),
        point({ fiscal_year: 2027, equity_mid: 471_172, is_forecast: true }),
      ],
    } as unknown as ValuationResponse

    expect(shouldSuppressForecastTimelineRowsForDcf(result)).toBe(true)
    expect(buildValuationCurveRows(result).map((row) => row.label)).toEqual(['2024', '2025'])
  })

  it('suppresses projected snapshots when adaptive reports were actually DCF-led', () => {
    const result = {
      selected_valuation_method: 'upswitch_adaptive',
      methodology: 'Comprehensive Valuation',
      methods_used: ['DCF', 'FCFF'],
      dcf_valuation: { enterprise_value: 586_761 },
      valuation_timeline: [
        point({ fiscal_year: 2024, equity_mid: 378_675 }),
        point({ fiscal_year: 2025, equity_mid: 586_761 }),
        point({ fiscal_year: 2026, equity_mid: 457_449, is_forecast: true }),
      ],
    } as unknown as ValuationResponse

    expect(shouldSuppressForecastTimelineRowsForDcf(result)).toBe(true)
    expect(buildValuationCurveRows(result).map((row) => row.label)).toEqual(['2024', '2025'])
  })

  it('recognizes plural discounted cash flow labels from serialized payloads', () => {
    const result = {
      selected_valuation_method: 'Discounted Cash Flows (FCFF)',
      dcf_valuation: { enterprise_value: 586_761 },
      valuation_timeline: [
        point({ fiscal_year: 2024, equity_mid: 378_675 }),
        point({ fiscal_year: 2025, equity_mid: 586_761 }),
        point({ fiscal_year: 2026, equity_mid: 457_449, is_forecast: true }),
      ],
    } as unknown as ValuationResponse

    expect(shouldSuppressForecastTimelineRowsForDcf(result)).toBe(true)
    expect(buildValuationCurveRows(result).map((row) => row.label)).toEqual(['2024', '2025'])
  })

  it('suppresses serialized forecast markers for DCF-led reports', () => {
    const result = {
      selected_valuation_method: 'dcf',
      dcf_valuation: { enterprise_value: 586_761 },
      valuation_timeline: [
        point({ fiscal_year: 2024, equity_mid: 378_675 }),
        point({ fiscal_year: 2025, equity_mid: 586_761 }),
        point({
          fiscal_year: 2026,
          equity_mid: 457_449,
          is_forecast: 'true' as unknown as boolean,
        }),
        {
          fiscal_year: 2027,
          equity_low: 80,
          equity_mid: 471_172,
          equity_high: 120,
          kind: 'projection',
        } as unknown as ValuationTimelinePoint,
      ],
    } as unknown as ValuationResponse

    expect(buildValuationCurveRows(result).map((row) => row.label)).toEqual(['2024', '2025'])
  })

  it('suppresses projected snapshots when DCF has the full methodology weight', () => {
    const result = {
      dcf_weight: '1.0',
      multiples_weight: '0',
      dcf_valuation: { enterprise_value: 586_761 },
      valuation_timeline: [
        point({ fiscal_year: 2024 }),
        point({ fiscal_year: 2025 }),
        point({ fiscal_year: 2026, is_forecast: true }),
      ],
    } as unknown as ValuationResponse

    expect(shouldSuppressForecastTimelineRowsForDcf(result)).toBe(true)
    expect(buildValuationCurveRows(result).map((row) => row.label)).toEqual(['2024', '2025'])
  })

  it('keeps forecast rows for non-DCF valuation timelines', () => {
    const result = {
      selected_valuation_method: 'ebitda_multiple',
      valuation_timeline: [
        point({ fiscal_year: 2024 }),
        point({ fiscal_year: 2025 }),
        point({ fiscal_year: 2026, is_forecast: true }),
      ],
    } as unknown as ValuationResponse

    expect(shouldSuppressForecastTimelineRowsForDcf(result)).toBe(false)
    expect(buildValuationCurveRows(result).map((row) => row.label)).toEqual([
      '2024',
      '2025',
      '2026',
    ])
  })

  it('keeps projected snapshots for mixed adaptive valuations with DCF details', () => {
    const result = {
      selected_valuation_method: 'upswitch_adaptive',
      dcf_weight: 0.5,
      multiples_weight: 0.5,
      dcf_valuation: { enterprise_value: 586_761 },
      valuation_timeline: [
        point({ fiscal_year: 2024 }),
        point({ fiscal_year: 2025 }),
        point({ fiscal_year: 2026, is_forecast: true }),
      ],
    } as unknown as ValuationResponse

    expect(shouldSuppressForecastTimelineRowsForDcf(result)).toBe(false)
    expect(buildValuationCurveRows(result).map((row) => row.label)).toEqual([
      '2024',
      '2025',
      '2026',
    ])
  })

  it('does not treat explicit negative method labels as DCF-led', () => {
    for (const selected_valuation_method of [
      'not_dcf',
      'not_dcf_method',
      'non_discounted_cash_flow',
    ]) {
      const result = {
        selected_valuation_method,
        dcf_valuation: { enterprise_value: 586_761 },
        valuation_timeline: [
          point({ fiscal_year: 2024 }),
          point({ fiscal_year: 2025 }),
          point({ fiscal_year: 2026, is_forecast: true }),
        ],
      } as unknown as ValuationResponse

      expect(shouldSuppressForecastTimelineRowsForDcf(result)).toBe(false)
      expect(buildValuationCurveRows(result).map((row) => row.label)).toEqual([
        '2024',
        '2025',
        '2026',
      ])
    }
  })

  it('falls back to the headline band when a DCF timeline only contains forecasts', () => {
    const rows = buildValuationCurveRows({
      selected_valuation_method: 'dcf',
      dcf_valuation: { enterprise_value: 586_761 },
      equity_value_low: 480_000,
      equity_value_mid: 586_761,
      equity_value_high: 692_000,
      valuation_date: '2025-12-31T00:00:00.000Z',
      valuation_timeline: [
        point({ fiscal_year: 2026, equity_mid: 457_449, is_forecast: true }),
        point({ fiscal_year: 2027, equity_mid: 471_172, is_forecast: true }),
      ],
    } as unknown as ValuationResponse)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'headline:2025',
      label: '2025',
      valueMid: 586_761,
      isForecast: false,
    })
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
