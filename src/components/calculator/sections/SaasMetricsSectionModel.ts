import type { SaasSectorBenchmark } from './saasBenchmarks'

export type PrefillSource = 'benchmark' | 'history' | 'derived'

export type SaasPrefillField =
  | 'saas_gross_margin_pct'
  | 'saas_churn_pct'
  | 'saas_nrr_pct'
  | 'saas_customer_churn_pct'
  | 'saas_expansion_revenue_pct'
  | 'saas_arr_growth_pct'
  | 'saas_mrr'

export interface SaasPrefillPatch {
  field: SaasPrefillField
  value: number
  source: PrefillSource
}

interface SaasBenchmarkPrefillPlanParams {
  benchmark: SaasSectorBenchmark | null
  yoyGrowthPct: number | null
  importedSaasProvenance?: unknown
  currentValues: {
    saasArrGrowthPct?: number
    saasChurnPct?: number
    saasCustomerChurnPct?: number
    saasNrrPct?: number
    saasGrossMarginPct?: number
    saasExpansionRevenuePct?: number
  }
}

export function buildSaasBenchmarkPrefillPlan({
  benchmark,
  yoyGrowthPct,
  importedSaasProvenance,
  currentValues,
}: SaasBenchmarkPrefillPlanParams): {
  shouldMarkRan: boolean
  patches: SaasPrefillPatch[]
} {
  if (importedSaasProvenance || (!benchmark && yoyGrowthPct == null)) {
    return { shouldMarkRan: false, patches: [] }
  }

  const patches: SaasPrefillPatch[] = []
  if (benchmark && currentValues.saasGrossMarginPct == null) {
    patches.push({
      field: 'saas_gross_margin_pct',
      value: benchmark.gross_margin_pct,
      source: 'benchmark',
    })
  }
  if (benchmark && currentValues.saasChurnPct == null) {
    patches.push({
      field: 'saas_churn_pct',
      value: benchmark.monthly_churn_pct,
      source: 'benchmark',
    })
  }
  if (benchmark && currentValues.saasNrrPct == null) {
    patches.push({ field: 'saas_nrr_pct', value: benchmark.nrr_pct, source: 'benchmark' })
  }
  if (benchmark && currentValues.saasCustomerChurnPct == null) {
    patches.push({
      field: 'saas_customer_churn_pct',
      value: benchmark.customer_churn_pct,
      source: 'benchmark',
    })
  }
  if (benchmark && currentValues.saasExpansionRevenuePct == null) {
    patches.push({
      field: 'saas_expansion_revenue_pct',
      value: benchmark.expansion_revenue_pct,
      source: 'benchmark',
    })
  }
  if (currentValues.saasArrGrowthPct == null) {
    if (yoyGrowthPct != null) {
      patches.push({ field: 'saas_arr_growth_pct', value: yoyGrowthPct, source: 'history' })
    } else if (benchmark) {
      patches.push({
        field: 'saas_arr_growth_pct',
        value: benchmark.annual_growth_pct,
        source: 'benchmark',
      })
    }
  }

  return { shouldMarkRan: true, patches }
}

export function buildSaasMrrPrefillPatch({
  saasArr,
  saasMrr,
  importedSaasProvenance,
  editedSinceFill,
}: {
  saasArr?: number
  saasMrr?: number
  importedSaasProvenance?: unknown
  editedSinceFill?: boolean
}): SaasPrefillPatch | null {
  if (saasArr == null || !Number.isFinite(saasArr)) return null
  if (saasMrr != null) return null
  if (importedSaasProvenance) return null
  if (editedSinceFill) return null
  return {
    field: 'saas_mrr',
    value: Math.round(saasArr / 12),
    source: 'derived',
  }
}

function countFiniteValues(values: Array<number | undefined>): number {
  return values.filter((value) => value != null && Number.isFinite(value)).length
}

export function buildSaasProgressModel({
  saasArr,
  saasMrr,
  saasArrGrowthPct,
  saasChurnPct,
  saasCustomerChurnPct,
  saasNrrPct,
  saasGrossMarginPct,
  saasCac,
  saasSmSpend,
  saasCustomerConcentrationPct,
  saasExpansionRevenuePct,
}: {
  saasArr?: number
  saasMrr?: number
  saasArrGrowthPct?: number
  saasChurnPct?: number
  saasCustomerChurnPct?: number
  saasNrrPct?: number
  saasGrossMarginPct?: number
  saasCac?: number
  saasSmSpend?: number
  saasCustomerConcentrationPct?: number
  saasExpansionRevenuePct?: number
}) {
  const totalFields = 11
  const filledCount = countFiniteValues([
    saasArr,
    saasMrr,
    saasArrGrowthPct,
    saasChurnPct,
    saasCustomerChurnPct,
    saasNrrPct,
    saasGrossMarginPct,
    saasCac,
    saasSmSpend,
    saasCustomerConcentrationPct,
    saasExpansionRevenuePct,
  ])
  const coreFilledCount = countFiniteValues([saasArr, saasMrr, saasArrGrowthPct, saasNrrPct])
  const advancedFilledCount = countFiniteValues([
    saasCac,
    saasSmSpend,
    saasCustomerConcentrationPct,
  ])
  const isReady = saasArr != null && Number.isFinite(saasArr) && coreFilledCount >= 3

  return {
    advancedFilledCount,
    coreFilledCount,
    filledCount,
    isReady,
    progressPct: (filledCount / totalFields) * 100,
    totalFields,
  }
}
