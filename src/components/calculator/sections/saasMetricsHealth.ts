export type HealthStatus = 'excellent' | 'good' | 'warning' | 'poor'

export function getSaasMetricHealthStatus(
  metric: string,
  value: number | null
): HealthStatus | null {
  if (value == null || !Number.isFinite(value)) return null
  switch (metric) {
    case 'ruleOf40':
      if (value >= 40) return 'excellent'
      if (value >= 25) return 'good'
      if (value >= 10) return 'warning'
      return 'poor'
    case 'ltvCac':
      if (value >= 3) return 'excellent'
      if (value >= 2) return 'good'
      if (value >= 1) return 'warning'
      return 'poor'
    case 'cacPaybackMonths':
      if (value <= 12) return 'excellent'
      if (value <= 18) return 'good'
      if (value <= 24) return 'warning'
      return 'poor'
    case 'magicNumber':
      if (value >= 1) return 'excellent'
      if (value >= 0.75) return 'good'
      if (value >= 0.5) return 'warning'
      return 'poor'
    case 'nrrExpansionSpread':
      if (value >= 20) return 'excellent'
      if (value >= 10) return 'good'
      if (value >= 0) return 'warning'
      return 'poor'
    default:
      return null
  }
}
