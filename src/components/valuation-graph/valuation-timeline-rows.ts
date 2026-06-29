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

function toFiscalYear(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!/^\d{4}$/.test(trimmed)) return null
    const year = Number(trimmed)
    return Number.isInteger(year) && year > 0 ? year : null
  }
  return null
}

function hasTruthyForecastMarker(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === 'number') return value === 1
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'forecast' ||
    normalized === 'projected' ||
    normalized === 'projection' ||
    normalized === 'prognosis' ||
    normalized === 'forward'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isForecastTimelinePoint(point: unknown): boolean {
  if (!isRecord(point)) return false
  if (
    hasTruthyForecastMarker(point.is_forecast) ||
    hasTruthyForecastMarker(point.isForecast) ||
    hasTruthyForecastMarker(point.forecast) ||
    hasTruthyForecastMarker(point.is_projection) ||
    hasTruthyForecastMarker(point.isProjection) ||
    hasTruthyForecastMarker(point.projection)
  ) {
    return true
  }
  return ['year_type', 'period_type', 'data_type', 'kind', 'type'].some((key) =>
    hasTruthyForecastMarker(point[key])
  )
}

export function valuationTimelineHasForecastRows(
  timeline: ValuationTimelinePoint[] | null | undefined
): boolean {
  return timeline?.some((point) => isForecastTimelinePoint(point)) ?? false
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
    const year = toFiscalYear(point?.fiscal_year)
    if (year == null) continue
    if (toFiniteNumber(point?.equity_mid) == null) continue
    // Last entry for a given year wins (defensive — the engine emits one per year).
    bestByYear.set(year, point)
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
      isForecast: isForecastTimelinePoint(point),
    }
  })

  return buildChartRows(points)
}

function normalizeMethodToken(value: unknown): string {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
    : ''
}

function methodTextContainsDcf(value: unknown): boolean {
  const normalized = normalizeMethodToken(value)
  if (!normalized) return false
  const tokens = normalized.split('_').filter(Boolean)
  if (tokens[0] === 'no' || tokens[0] === 'non' || tokens[0] === 'not') return false
  if (tokens.includes('dcf')) return true
  if (tokens.includes('fcff')) return true
  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (
      tokens[index] === 'discounted' &&
      tokens[index + 1] === 'cash' &&
      (tokens[index + 2] === 'flow' || tokens[index + 2] === 'flows')
    ) {
      return true
    }
  }
  return false
}

function toMethodTokens(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(normalizeMethodToken).filter(Boolean)
  const normalized = normalizeMethodToken(value)
  return normalized ? [normalized] : []
}

function toFiniteMethodWeight(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function structuredMethodEvidenceIsDcfLed(result: ValuationResponse): boolean {
  const record = result as unknown as Record<string, unknown>
  const methodsUsed = toMethodTokens(record.methods_used)
  if (methodsUsed.length > 0 && methodsUsed.every(methodTextContainsDcf)) return true

  const selection = isRecord(result.methodology_selection) ? result.methodology_selection : null
  if (selection) {
    if (methodTextContainsDcf(selection.selected_methodology)) return true
    const dcfWeight = toFiniteMethodWeight(selection.dcf_weight)
    const multiplesWeight = toFiniteMethodWeight(selection.multiples_weight)
    if (
      dcfWeight != null &&
      dcfWeight >= 0.99 &&
      (multiplesWeight == null || multiplesWeight <= 0.01)
    ) {
      return true
    }
  }

  const dcfWeight = toFiniteMethodWeight(result.dcf_weight)
  const multiplesWeight = toFiniteMethodWeight(result.multiples_weight)
  return (
    dcfWeight != null && dcfWeight >= 0.99 && (multiplesWeight == null || multiplesWeight <= 0.01)
  )
}

/**
 * DCF-led reports have their forecast mechanics in the report's FCFF/DCF table.
 * The engine timeline's forecast rows are independent projected valuation
 * snapshots, so showing them as a tail beside a DCF report reads as the wrong
 * object. Keep the actual/current curve and leave DCF forecasts to the report.
 */
export function shouldSuppressForecastTimelineRowsForDcf(
  result: ValuationResponse | null | undefined
): boolean {
  if (!result?.dcf_valuation) return false
  return (
    methodTextContainsDcf(result.selected_valuation_method) ||
    methodTextContainsDcf(result.primary_method) ||
    methodTextContainsDcf(result.methodology) ||
    structuredMethodEvidenceIsDcfLed(result)
  )
}

export function buildValuationCurveRows(result: ValuationResponse | null | undefined): ChartRow[] {
  const timelineRows = buildTimelineChartRows(result?.valuation_timeline)
  if (timelineRows.length > 0) {
    if (shouldSuppressForecastTimelineRowsForDcf(result)) {
      const actualRows = timelineRows.filter((row) => row.isForecast !== true)
      return actualRows.length > 0 ? actualRows : buildHeadlineFallbackRows(result)
    }
    return timelineRows
  }
  return buildHeadlineFallbackRows(result)
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
