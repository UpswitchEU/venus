export function validMetric(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function metricChange(from: number | undefined, to: number | undefined): number | null {
  return validMetric(from) && validMetric(to) ? to - from : null
}

export function percentageChange(from: number | undefined, to: number | undefined): number | null {
  const change = metricChange(from, to)
  // Zero and negative baselines do not support the usual percentage-growth interpretation.
  return change !== null && validMetric(from) && from > 0 ? (change / from) * 100 : null
}

export function formatComparisonRange(
  low: number | undefined,
  high: number | undefined,
  format: (value: number) => string
): string | undefined {
  if (!validMetric(low) || !validMetric(high) || low > high) return undefined
  return `${format(low)} – ${format(high)}`
}
