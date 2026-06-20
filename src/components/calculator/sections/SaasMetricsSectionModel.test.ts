import { describe, expect, it } from 'vitest'
import {
  buildSaasBenchmarkPrefillPlan,
  buildSaasMrrPrefillPatch,
  buildSaasProgressModel,
} from './SaasMetricsSectionModel'
import type { SaasSectorBenchmark } from './saasBenchmarks'

const benchmark: SaasSectorBenchmark = {
  annual_growth_pct: 60,
  customer_churn_pct: 5,
  expansion_revenue_pct: 13,
  gross_margin_pct: 78,
  monthly_churn_pct: 3,
  nrr_pct: 110,
}

describe('SaasMetricsSectionModel', () => {
  it('builds benchmark prefill patches for blank SaaS fields', () => {
    expect(
      buildSaasBenchmarkPrefillPlan({
        benchmark,
        yoyGrowthPct: null,
        currentValues: {},
      })
    ).toEqual({
      shouldMarkRan: true,
      patches: [
        { field: 'saas_gross_margin_pct', value: 78, source: 'benchmark' },
        { field: 'saas_churn_pct', value: 3, source: 'benchmark' },
        { field: 'saas_nrr_pct', value: 110, source: 'benchmark' },
        { field: 'saas_customer_churn_pct', value: 5, source: 'benchmark' },
        { field: 'saas_expansion_revenue_pct', value: 13, source: 'benchmark' },
        { field: 'saas_arr_growth_pct', value: 60, source: 'benchmark' },
      ],
    })
  })

  it('prefers historical YoY growth over benchmark growth and preserves user values', () => {
    const plan = buildSaasBenchmarkPrefillPlan({
      benchmark,
      yoyGrowthPct: 24,
      currentValues: {
        saasGrossMarginPct: 82,
        saasNrrPct: 120,
      },
    })

    expect(plan.shouldMarkRan).toBe(true)
    expect(plan.patches).toEqual([
      { field: 'saas_churn_pct', value: 3, source: 'benchmark' },
      { field: 'saas_customer_churn_pct', value: 5, source: 'benchmark' },
      { field: 'saas_expansion_revenue_pct', value: 13, source: 'benchmark' },
      { field: 'saas_arr_growth_pct', value: 24, source: 'history' },
    ])
  })

  it('suppresses benchmark prefill when provider metrics are imported', () => {
    expect(
      buildSaasBenchmarkPrefillPlan({
        benchmark,
        yoyGrowthPct: 24,
        importedSaasProvenance: { source: 'exact' },
        currentValues: {},
      })
    ).toEqual({ shouldMarkRan: false, patches: [] })
  })

  it('derives MRR from ARR only when the field is blank and not imported', () => {
    expect(
      buildSaasMrrPrefillPatch({
        saasArr: 1_200_000,
      })
    ).toEqual({ field: 'saas_mrr', value: 100_000, source: 'derived' })

    expect(buildSaasMrrPrefillPatch({ saasArr: 1_200_000, saasMrr: 42_000 })).toBeNull()
    expect(
      buildSaasMrrPrefillPatch({
        saasArr: 1_200_000,
        importedSaasProvenance: { source: 'exact' },
      })
    ).toBeNull()
    expect(buildSaasMrrPrefillPatch({ saasArr: 1_200_000, editedSinceFill: true })).toBeNull()
  })

  it('derives progress readiness from finite core fields', () => {
    expect(
      buildSaasProgressModel({
        saasArr: 500_000,
        saasArrGrowthPct: 25,
        saasNrrPct: 110,
        saasCac: 1500,
      })
    ).toMatchObject({
      advancedFilledCount: 1,
      filledCount: 4,
      isReady: true,
      totalFields: 11,
    })

    expect(
      buildSaasProgressModel({
        saasArr: 500_000,
        saasCac: 1500,
        saasSmSpend: 120_000,
      }).isReady
    ).toBe(false)
  })
})
