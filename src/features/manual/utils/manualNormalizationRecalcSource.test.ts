// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '@/types/valuation'
import { buildManualNormalizationRecalcSource } from './manualNormalizationRecalcSource'

function baseForm(): ValuationFormData {
  return {
    company_name: 'Stored Co',
    country_code: 'BE',
    industry: 'services',
    business_model: 'services',
    founding_year: 2001,
    revenue: 100,
    ebitda: 10,
    current_year_data: { year: 2025, revenue: 100, ebitda: 10 },
    historical_years_data: [{ year: 2024, revenue: 90, ebitda: 9 }],
  }
}

describe('buildManualNormalizationRecalcSource', () => {
  it('lets latest financial overrides win', () => {
    const latest = {
      company_name: 'Latest Co',
      revenue: 200,
      ebitda: 20,
      current_year_data: { year: 2025, revenue: 200, ebitda: 20 },
      historical_years_data: [{ year: 2024, revenue: 180, ebitda: 18 }],
    } satisfies Partial<ValuationFormData>

    const source = buildManualNormalizationRecalcSource({
      formStoreData: baseForm(),
      latestFinancialOverrides: latest,
    })

    expect(source).toMatchObject({
      company_name: 'Latest Co',
      revenue: 200,
      ebitda: 20,
      current_year_data: { year: 2025, revenue: 200, ebitda: 20 },
      historical_years_data: [{ year: 2024, revenue: 180, ebitda: 18 }],
    })
  })

  it('falls back to stored canonical year rows and top-level figures when latest data omits them', () => {
    const source = buildManualNormalizationRecalcSource({
      formStoreData: baseForm(),
      latestFinancialOverrides: {
        company_name: 'Latest Co',
      },
    })

    expect(source).toMatchObject({
      company_name: 'Latest Co',
      revenue: 100,
      ebitda: 10,
      current_year_data: { year: 2025, revenue: 100, ebitda: 10 },
      historical_years_data: [{ year: 2024, revenue: 90, ebitda: 9 }],
    })
  })

  it('preserves explicit zero overrides instead of falling back', () => {
    const source = buildManualNormalizationRecalcSource({
      formStoreData: baseForm(),
      latestFinancialOverrides: {
        revenue: 0,
        ebitda: 0,
      },
    })

    expect(source.revenue).toBe(0)
    expect(source.ebitda).toBe(0)
  })
})
