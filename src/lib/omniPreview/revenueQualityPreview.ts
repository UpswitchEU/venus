/**
 * Derived signals from revenue-quality fields (inform risk / context; not a full engine substitute).
 */

export type RevenueQualityPreviewInputs = {
  revenue?: number
  revRecurringPct?: number
  revTopClientConcentrationPct?: number
  revContractBacklog?: number
  /** Absolute currency amount of recurring revenue (new smart input). */
  revRecurringAmount?: number
  /** Absolute currency amount of top-3 client revenue (new smart input). */
  revTopClientAmount?: number
}

export type RevenueQualityPreviewMetrics = {
  estimatedRecurringRevenue: number | null
  topClientRevenueAtRisk: number | null
  backlogMonthsOfRevenue: number | null
  /** Derived recurring revenue as % of total (for badge display). */
  recurringPctOfRevenue: number | null
  /** Derived top-client concentration as % of total (for badge display). */
  topClientPctOfRevenue: number | null
}

export type RecurringBadge = 'low' | 'medium' | 'high'
export type TopClientBadge = 'high' | 'low'

export function getRecurringRevenueBadge(pct: number | null): RecurringBadge | null {
  if (pct == null) return null
  if (pct < 30) return 'low'
  if (pct <= 70) return 'medium'
  return 'high'
}

export function getTopClientBadge(pct: number | null): TopClientBadge | null {
  if (pct == null) return null
  return pct > 25 ? 'high' : 'low'
}

export function computeRevenueQualityPreview(
  input: RevenueQualityPreviewInputs
): RevenueQualityPreviewMetrics {
  const {
    revenue,
    revRecurringPct,
    revTopClientConcentrationPct,
    revContractBacklog,
    revRecurringAmount,
    revTopClientAmount,
  } = input

  const rev = revenue != null && Number.isFinite(revenue) && revenue > 0 ? revenue : null

  // Recurring revenue: prefer absolute amount (new), fall back to percentage (legacy).
  // Guard: amounts must be non-negative; percentages are clamped to [0, 100].
  const estimatedRecurringRevenue =
    revRecurringAmount != null && Number.isFinite(revRecurringAmount) && revRecurringAmount >= 0
      ? revRecurringAmount
      : rev != null && revRecurringPct != null && Number.isFinite(revRecurringPct)
        ? rev * (Math.min(Math.max(revRecurringPct, 0), 100) / 100)
        : null

  const recurringPctOfRevenue =
    rev != null && estimatedRecurringRevenue != null
      ? Math.min((estimatedRecurringRevenue / rev) * 100, 100)
      : null

  // Top-client exposure: prefer absolute amount (new), fall back to percentage (legacy).
  const topClientRevenueAtRisk =
    revTopClientAmount != null && Number.isFinite(revTopClientAmount) && revTopClientAmount >= 0
      ? revTopClientAmount
      : rev != null &&
          revTopClientConcentrationPct != null &&
          Number.isFinite(revTopClientConcentrationPct)
        ? rev * (Math.min(Math.max(revTopClientConcentrationPct, 0), 100) / 100)
        : null

  const topClientPctOfRevenue =
    rev != null && topClientRevenueAtRisk != null
      ? Math.min((topClientRevenueAtRisk / rev) * 100, 100)
      : null

  const backlogMonthsOfRevenue =
    rev != null &&
    revContractBacklog != null &&
    Number.isFinite(revContractBacklog) &&
    revContractBacklog >= 0
      ? (revContractBacklog / rev) * 12
      : null

  return {
    estimatedRecurringRevenue,
    topClientRevenueAtRisk,
    backlogMonthsOfRevenue,
    recurringPctOfRevenue,
    topClientPctOfRevenue,
  }
}
