import type { ChartLabels, ChartRow } from './valuation-graph-model'
import { formatDate, formatGraphCurrency } from './valuation-graph-model'

export function getNumericTickValues(
  scale: { ticks?: (count?: number) => number[] },
  count: number
): number[] {
  return typeof scale.ticks === 'function'
    ? scale.ticks(count).filter((value) => Number.isFinite(value))
    : []
}

export function hasIntradayDuplicateDates(rows: ChartRow[], locale: string): boolean {
  const countsByDay = new Map<string, number>()
  for (const row of rows) {
    const dayLabel = formatDate(row.observedAtDate, locale)
    if (!dayLabel) continue
    const nextCount = (countsByDay.get(dayLabel) ?? 0) + 1
    countsByDay.set(dayLabel, nextCount)
    if (nextCount > 1) return true
  }
  return false
}

export function formatConfidenceScore(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null
  const normalized = value > 1 && value <= 100 ? value / 100 : value
  if (normalized < 0 || normalized > 1) return null
  return `${Math.round(normalized * 100)}%`
}

export function formatGraphRange(
  row: Pick<ChartRow, 'rangeLow' | 'rangeHigh'>,
  currency: string | null | undefined,
  locale: string
): string {
  return `${formatGraphCurrency(row.rangeLow, currency, locale)} - ${formatGraphCurrency(row.rangeHigh, currency, locale)}`
}

export function resolvePointLabel(row: ChartRow, labels: ChartLabels): string {
  const pointLabel = row.label?.trim()
  if (row.source === 'valuation_version') return pointLabel || labels.version
  if (pointLabel && pointLabel.toLowerCase() !== 'report') return pointLabel
  return labels.reportSnapshot
}

export function resolvePointKindLabel(row: ChartRow, labels: ChartLabels): string {
  if (row.source === 'valuation_version') {
    return row.versionNumber != null ? `${labels.version} ${row.versionNumber}` : labels.version
  }
  return labels.reportSnapshot
}

export function resolvePointStatusLabel(row: ChartRow, labels: ChartLabels): string {
  // Engine-timeline points carry an explicit actual/forecast flag — surface it so
  // a projected year is labelled as such (never as a settled "Valuation").
  if (typeof row.isForecast === 'boolean') {
    return row.isForecast ? labels.forecast : labels.actual
  }
  if (row.source !== 'valuation_version') {
    return resolvePointKindLabel(row, labels)
  }
  switch (row.triggerType) {
    case 'manual':
      return labels.triggerManual
    case 'auto_recalculation':
      return labels.triggerAutoRecalculation
    case 'conversation':
      return labels.triggerConversation
    case 'adjustment':
      return labels.triggerAdjustment
    default:
      if (!row.triggerType) return resolvePointKindLabel(row, labels)
      return row.triggerType.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }
}

export function getDateTickValuesFromRows(
  rows: ChartRow[],
  maxCount: number,
  locale: string
): Date[] {
  if (hasIntradayDuplicateDates(rows, locale)) {
    const byTimestamp = new Map<number, Date>()
    for (const row of rows) {
      byTimestamp.set(row.observedAtMs, row.observedAtDate)
    }
    return Array.from(byTimestamp.values()).sort((left, right) => left.getTime() - right.getTime())
  }

  const deduped: Date[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const label = formatDate(row.observedAtDate, locale)
    if (!label || seen.has(label)) continue
    seen.add(label)
    deduped.push(row.observedAtDate)
  }
  const limit = Math.max(2, maxCount)
  if (deduped.length <= limit) return deduped

  const sampled: Date[] = []
  for (let i = 0; i < limit; i++) {
    const index = Math.round((i * (deduped.length - 1)) / (limit - 1))
    const tick = deduped[index]
    if (!tick) continue
    if (sampled[sampled.length - 1]?.getTime() === tick.getTime()) continue
    sampled.push(tick)
  }
  return sampled
}
