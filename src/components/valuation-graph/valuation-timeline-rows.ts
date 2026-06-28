/**
 * Venus adapter: the engine's per-year `valuation_timeline` → the universal
 * {@link ChartRow}[] the ported trend chart renders. This is the only data-shaping
 * Venus owns; everything downstream is Mercury's shared chart, unchanged.
 *
 * The report shows the latest fiscal year; this curve shows every year the engine
 * valued (historical actuals + current + forecast) so the full trend is visible.
 */

import type { ValuationResponse, ValuationTimelinePoint } from '@/types/valuation'
import { buildChartRows, type ChartRow } from './valuation-graph-model'

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

/** Dec-31 (UTC) fiscal-year anchor — matches the canonical observation date. */
function fiscalYearAnchorIso(year: number): string {
  return `${year}-12-31T00:00:00.000Z`
}

/**
 * Map the engine timeline to chart rows. One point per fiscal year (deduped,
 * latest entry wins), forecast years included. Drops points with no finite year
 * or midpoint so a malformed row can never break the curve.
 */
export function buildTimelineChartRows(
  timeline: ValuationTimelinePoint[] | null | undefined
): ChartRow[] {
  if (!timeline?.length) return []

  const bestByYear = new Map<number, ValuationTimelinePoint>()
  for (const point of timeline) {
    const year = toFiniteNumber(point?.fiscal_year)
    if (year == null) continue
    const truncated = Math.trunc(year)
    if (truncated <= 0) continue
    if (toFiniteNumber(point?.equity_mid) == null) continue
    // Last entry for a given year wins (defensive — the engine emits one per year).
    bestByYear.set(truncated, point)
  }

  const points = [...bestByYear.entries()].map(([year, point]) => {
    const mid = toFiniteNumber(point.equity_mid) ?? 0
    const low = toFiniteNumber(point.equity_low)
    const high = toFiniteNumber(point.equity_high)
    return {
      id: `timeline:${year}`,
      reportId: 'valuation-timeline',
      versionId: null,
      versionNumber: null,
      observedAt: fiscalYearAnchorIso(year),
      valueLow: low ?? mid,
      valueMid: mid,
      valueHigh: high ?? mid,
      askingPrice: null,
      methodology:
        typeof point.methodology_used === 'string' && point.methodology_used.trim()
          ? point.methodology_used.trim()
          : null,
      triggerType: null,
      confidenceScore: toFiniteNumber(point.confidence_score),
      source: 'valuation_report' as const,
      label: String(year),
      isForecast: point.is_forecast === true,
    }
  })

  return buildChartRows(points)
}

/**
 * Fallback single dated point built from the headline equity band, for results
 * that predate the timeline (legacy persisted reports). Anchored to the valuation
 * date's fiscal year so it sits where its timeline point would.
 */
export function buildHeadlineFallbackRows(
  result: ValuationResponse | null | undefined
): ChartRow[] {
  if (!result) return []
  const mid = toFiniteNumber(result.equity_value_mid)
  if (mid == null) return []
  const low = toFiniteNumber(result.equity_value_low)
  const high = toFiniteNumber(result.equity_value_high)

  const dateSource = result.valuation_date || result.timestamp
  const parsed = dateSource ? new Date(dateSource) : null
  const year =
    parsed && !Number.isNaN(parsed.getTime())
      ? parsed.getUTCFullYear()
      : new Date().getUTCFullYear()

  return buildChartRows([
    {
      id: `headline:${year}`,
      reportId: 'valuation-headline',
      versionId: null,
      versionNumber: null,
      observedAt: fiscalYearAnchorIso(year),
      valueLow: low ?? mid,
      valueMid: mid,
      valueHigh: high ?? mid,
      askingPrice: toFiniteNumber(result.recommended_asking_price),
      methodology:
        typeof result.methodology === 'string' && result.methodology.trim()
          ? result.methodology.trim()
          : (result.primary_method ?? null),
      triggerType: null,
      confidenceScore: toFiniteNumber(result.confidence_score),
      source: 'valuation_report',
      label: String(year),
      isForecast: false,
    },
  ])
}

/**
 * Resolve the chart's display currency. Prefer the headline result's currency:
 * the engine hard-codes "EUR" on every timeline point regardless of the company's
 * actual currency, but each year's value is computed on the same lens as the
 * headline (no FX conversion), so the headline currency is the correct label for
 * all of them. Falls back to a timeline point's currency, then EUR.
 */
export function resolveTimelineCurrency(result: ValuationResponse | null | undefined): string {
  const headline = typeof result?.currency === 'string' ? result.currency.trim() : ''
  if (headline) return headline
  const fromTimeline = result?.valuation_timeline?.find(
    (point) => typeof point.currency === 'string' && point.currency.trim()
  )?.currency
  if (fromTimeline?.trim()) return fromTimeline.trim()
  return 'EUR'
}
