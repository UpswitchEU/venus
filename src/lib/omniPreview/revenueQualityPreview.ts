/**
 * Derived signals from revenue-quality fields (inform risk / context; not a full engine substitute).
 */

export type RevenueQualityPreviewInputs = {
  revenue?: number
  revRecurringPct?: number
  revTopClientConcentrationPct?: number
  revContractBacklog?: number
}

export type RevenueQualityPreviewMetrics = {
  estimatedRecurringRevenue: number | null
  topClientRevenueAtRisk: number | null
  backlogMonthsOfRevenue: number | null
}

export function computeRevenueQualityPreview(
  input: RevenueQualityPreviewInputs
): RevenueQualityPreviewMetrics {
  const { revenue, revRecurringPct, revTopClientConcentrationPct, revContractBacklog } = input

  const rev = revenue != null && Number.isFinite(revenue) && revenue > 0 ? revenue : null

  const estimatedRecurringRevenue =
    rev != null && revRecurringPct != null && Number.isFinite(revRecurringPct)
      ? rev * (revRecurringPct / 100)
      : null

  const topClientRevenueAtRisk =
    rev != null &&
    revTopClientConcentrationPct != null &&
    Number.isFinite(revTopClientConcentrationPct)
      ? rev * (revTopClientConcentrationPct / 100)
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
  }
}
