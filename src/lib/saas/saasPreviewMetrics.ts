/**
 * Pure preview math for the manual SaaS panel — mirrors ValuationIQ `saas_valuation_adjuster`
 * (Rule of 40, LTV/CAC, CAC payback, Magic Number, NRR expansion spread).
 * Keep formulas here only; UI components map to display (SSR-safe: no browser-only APIs).
 */

export type SaasPreviewInputs = {
  saasArr?: number
  saasMrr?: number
  saasArrGrowthPct?: number
  saasChurnPct?: number
  saasCustomerChurnPct?: number
  saasNrrPct?: number
  saasGrossMarginPct?: number
  saasCac?: number
  saasSmSpend?: number
}

export type SaasPreviewMetrics = {
  ruleOf40: number | null
  ltvCac: number | null
  cacPaybackMonths: number | null
  magicNumber: number | null
  nrrExpansionSpread: number | null
}

function ratioFromPercent(value?: number): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value / 100
}

/** Gross revenue churn % as 0–1 ratio; used in NRR expansion spread. */
export function computeNrrExpansionSpreadPct(
  nrrPct: number | undefined,
  grossRevenueChurnPct: number | undefined
): number | null {
  const revenueChurnRatio = ratioFromPercent(grossRevenueChurnPct)
  if (nrrPct == null || revenueChurnRatio == null || !Number.isFinite(nrrPct)) return null
  return nrrPct - (100 - revenueChurnRatio * 100)
}

/**
 * Monthly revenue for CAC payback: explicit MRR if present, else ARR/12 (matches Python engine).
 */
export function effectiveMonthlyRevenueForPayback(arr?: number, mrr?: number): number | null {
  if (mrr != null && mrr > 0) return mrr
  if (arr != null && arr > 0) return arr / 12
  return null
}

export function computeSaasPreviewMetrics(input: SaasPreviewInputs): SaasPreviewMetrics {
  const {
    saasArr,
    saasMrr,
    saasArrGrowthPct,
    saasChurnPct,
    saasCustomerChurnPct,
    saasNrrPct,
    saasGrossMarginPct,
    saasCac,
    saasSmSpend,
  } = input

  const grossMarginRatio = ratioFromPercent(saasGrossMarginPct)
  const _revenueChurnRatio = ratioFromPercent(saasChurnPct)
  const customerChurnRatio = ratioFromPercent(saasCustomerChurnPct)

  const ruleOf40 =
    saasArrGrowthPct != null && saasGrossMarginPct != null
      ? saasArrGrowthPct + saasGrossMarginPct
      : null

  const ltvCac =
    saasArr != null &&
    saasCac != null &&
    saasCac > 0 &&
    grossMarginRatio != null &&
    customerChurnRatio != null &&
    customerChurnRatio > 0
      ? (saasArr * grossMarginRatio) / customerChurnRatio / saasCac
      : null

  const monthly = effectiveMonthlyRevenueForPayback(saasArr, saasMrr)
  const cacPaybackMonths =
    saasCac != null &&
    saasCac > 0 &&
    monthly != null &&
    monthly > 0 &&
    grossMarginRatio != null &&
    grossMarginRatio > 0
      ? saasCac / (monthly * grossMarginRatio)
      : null

  const magicNumber =
    saasArr != null &&
    saasArr > 0 &&
    saasArrGrowthPct != null &&
    saasSmSpend != null &&
    saasSmSpend > 0
      ? ((saasArr * (saasArrGrowthPct / 100)) / saasSmSpend) * 4
      : null

  const nrrExpansionSpread = computeNrrExpansionSpreadPct(saasNrrPct, saasChurnPct)

  return {
    ruleOf40,
    ltvCac,
    cacPaybackMonths,
    magicNumber,
    nrrExpansionSpread,
  }
}
