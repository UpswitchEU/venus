/**
 * Valuation trend chart — data model.
 *
 * Ported faithfully from Mercury's universal valuation graph
 * (`features/accountants/clients/components/valuation-graph/valuation-graph-model.ts`)
 * so Venus renders the value-over-fiscal-years curve with identical geometry,
 * formatting and interaction. Trimmed to the presentational core: Mercury's
 * canonical-series / report-snapshot data helpers stay in Mercury (Venus feeds the
 * chart from the engine's `valuation_timeline` — see `valuation-timeline-rows.ts`).
 */

import { bisector } from 'd3-array'

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_X_DOMAIN_PADDING_MS = DAY_MS / 4
const MAX_X_DOMAIN_PADDING_MS = DAY_MS * 3
const X_DOMAIN_PADDING_RATIO = 0.08
export const MARGIN = { top: 18, right: 20, bottom: 28, left: 64 }

export type ValuationGraphTriggerType =
  | 'manual'
  | 'auto_recalculation'
  | 'conversation'
  | 'adjustment'
  | string

/** A single resolved valuation observation, before chart-row enrichment. */
export interface ValuationGraphPoint {
  id: string
  reportId: string
  versionId: string | null
  versionNumber: number | null
  observedAt: string
  valueLow: number | null
  valueMid: number
  valueHigh: number | null
  askingPrice: number | null
  methodology: string | null
  triggerType: ValuationGraphTriggerType | null
  confidenceScore: number | null
  source: 'valuation_version' | 'valuation_report'
  label: string
  /**
   * Whether this year is a forecast/projection (vs a historical or current
   * actual). Set for engine-timeline points; `undefined` for sources where the
   * distinction does not apply (e.g. version history). Drives the dashed forecast
   * segment, hollow dots, the projection divider, and the tooltip's Actual /
   * Forecast label — so a projected year is never plotted as if it were a fact.
   */
  isForecast?: boolean
}

export type ChartRow = ValuationGraphPoint & {
  observedAtDate: Date
  observedAtMs: number
  rangeLow: number
  rangeHigh: number
}

function toLocaleCode(locale: string): string {
  return locale === 'fr' ? 'fr-BE' : locale === 'nl' ? 'nl-BE' : 'en-GB'
}

export function formatDate(value: string | number | Date, locale: string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(toLocaleCode(locale), {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  }).format(date)
}

export function formatAxisDate(
  value: string | number | Date,
  locale: string,
  includeTime: boolean
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  if (!includeTime) return formatDate(date, locale)
  return new Intl.DateTimeFormat(toLocaleCode(locale), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatTooltipDate(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(toLocaleCode(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * Year-only label. The curve plots Dec-31-anchored fiscal YEARS, so the axis tick
 * and the hover tooltip should read "2026", never "31 Dec 26" (a precise-looking
 * but misleading rendering of the fiscal anchor). Uses the UTC year to match the
 * canonical `${year}-12-31T00:00:00.000Z` anchor regardless of the viewer's tz.
 */
export function formatYear(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return String(date.getUTCFullYear())
}

/** Axis/tooltip x-unit: a real calendar date, or the fiscal year only. */
export type ChartDateMode = 'date' | 'year'

export function formatGraphCurrency(
  value: number,
  currency: string | null | undefined,
  locale: string
): string {
  const resolvedCurrency = currency || 'EUR'
  const absValue = Math.abs(value)
  const compact = absValue >= 1000
  const formatted = new Intl.NumberFormat(toLocaleCode(locale), {
    style: 'currency',
    currency: resolvedCurrency,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: 0,
    maximumFractionDigits: absValue >= 1_000_000 ? 1 : 0,
  }).format(value)
  return compact
    ? formatted.replace(/([0-9.,])([KMBT])\b/g, (_match, number, suffix) => {
        return `${number}${suffix.toLowerCase()}`
      })
    : formatted
}

export function buildChartRows(points: ValuationGraphPoint[]): ChartRow[] {
  return points
    .flatMap((point) => {
      const observedAtMs = new Date(point.observedAt).getTime()
      if (!Number.isFinite(observedAtMs)) return []
      if (!Number.isFinite(point.valueMid)) return []
      const low =
        point.valueLow != null && Number.isFinite(point.valueLow) ? point.valueLow : point.valueMid
      const high =
        point.valueHigh != null && Number.isFinite(point.valueHigh)
          ? point.valueHigh
          : point.valueMid
      const askingPrice =
        point.askingPrice != null && Number.isFinite(point.askingPrice) ? point.askingPrice : null
      const lo = Math.min(low, high, point.valueMid)
      const hi = Math.max(low, high, point.valueMid)
      return [
        {
          ...point,
          askingPrice,
          observedAtDate: new Date(observedAtMs),
          observedAtMs,
          rangeLow: lo,
          rangeHigh: hi,
        },
      ]
    })
    .sort((a, b) => {
      const dateDelta = a.observedAtMs - b.observedAtMs
      if (dateDelta !== 0) return dateDelta
      const versionDelta = (a.versionNumber ?? 0) - (b.versionNumber ?? 0)
      if (versionDelta !== 0) return versionDelta
      return a.id.localeCompare(b.id)
    })
}

export function getYDomain(rows: ChartRow[]): [number, number] {
  const values = rows.flatMap((row) => [
    row.rangeLow,
    row.valueMid,
    row.rangeHigh,
    ...(row.askingPrice != null ? [row.askingPrice] : []),
  ])
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  const magnitude = Math.max(Math.abs(min), Math.abs(max))
  const spread = Math.max(max - min, magnitude * 0.12, 1)
  const lower = min >= 0 ? Math.max(0, min - spread * 0.45) : min - spread * 0.45
  const upper = max <= 0 ? Math.min(0, max + spread * 0.55) : max + spread * 0.55
  return [lower, upper]
}

export function getXDomain(rows: ChartRow[]): [Date, Date] {
  if (rows.length === 0) return [new Date(), new Date()]
  if (rows.length === 1) {
    const t = rows[0].observedAtMs
    return [new Date(t - DAY_MS), new Date(t + DAY_MS)]
  }
  const ms = rows.map((row) => row.observedAtMs)
  const min = Math.min(...ms)
  const max = Math.max(...ms)
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [new Date(), new Date()]
  }
  if (min === max) {
    return [new Date(min - DAY_MS), new Date(max + DAY_MS)]
  }
  const span = max - min
  const padding = Math.min(
    MAX_X_DOMAIN_PADDING_MS,
    Math.max(MIN_X_DOMAIN_PADDING_MS, span * X_DOMAIN_PADDING_RATIO)
  )
  return [new Date(min - padding), new Date(max + padding)]
}

/**
 * A market-cleared valuation EVENT (funding round / exit / IPO) overlaid on the
 * chart. Distinct from our filings-based estimate line. Purely additive: when no
 * markers are passed the chart renders exactly as before.
 */
export interface ValuationMilestoneMarker {
  id: string
  type: 'funding_round' | 'exit' | 'ipo' | 'buyout' | 'acquisition'
  date: Date
  /** Short label, e.g. "Series D". */
  label: string
  /** Full detail for hover/aria, e.g. "Series D · $1.4B post-money · DST Global". */
  detail: string
  sourceUrl: string | null
  sourceOutlet: string | null
}

/** Funding rounds get one glyph; exits/IPOs/buyouts another (the "market event"). */
export function isMarketExitEvent(type: ValuationMilestoneMarker['type']): boolean {
  return type !== 'funding_round'
}

const MILESTONE_X_PAD_MS = DAY_MS * 30

/**
 * X-domain extended to span milestone event dates so the markers land in-range.
 * Falls back to the plain row domain when no milestones are supplied.
 */
export function getXDomainWithMilestones(
  rows: ChartRow[],
  milestones: ValuationMilestoneMarker[] | undefined | null
): [Date, Date] {
  const base = getXDomain(rows)
  if (!milestones || milestones.length === 0) return base
  const times = milestones.map((m) => m.date.getTime()).filter((t) => Number.isFinite(t))
  if (times.length === 0) return base
  const lo = Math.min(base[0].getTime(), ...times) - MILESTONE_X_PAD_MS
  const hi = Math.max(base[1].getTime(), ...times) + MILESTONE_X_PAD_MS
  return [new Date(lo), new Date(hi)]
}

export interface ChartLabels {
  date: string
  range: string
  midpoint: string
  askingPrice: string
  method: string
  version: string
  reportSnapshot: string
  status: string
  triggerManual: string
  triggerAutoRecalculation: string
  triggerConversation: string
  triggerAdjustment: string
  confidence: string
  /** Tooltip/status label for a historical or current actual year. */
  actual: string
  /** Tooltip/status label for a forecast/projection year. */
  forecast: string
}

export const bisectByDate = bisector<ChartRow, Date>((d) => d.observedAtDate).left

/**
 * Year-over-year change of the latest point vs the previous one — value + percent
 * with a tone for the header chip. Returns null when there is no comparable prior
 * value (single point, or a non-positive base that would make the percent absurd).
 */
export function formatDelta(
  current: number,
  previous: number | null,
  locale: string,
  currency: string | null | undefined
): { label: string; tone: 'up' | 'down' | 'flat' } | null {
  if (previous == null || previous <= 0) return null
  const delta = current - previous
  const percent = (delta / previous) * 100
  if (!Number.isFinite(percent)) return null
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''
  const amountLabel = formatGraphCurrency(Math.abs(delta), currency, locale)
  return {
    label: `${sign}${Math.abs(percent).toFixed(1)}% (${sign}${amountLabel})`,
    tone: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
  }
}
