import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import {
  deriveImportedSaasProvenance,
  deriveSaasSectionComplete,
  SaasMetricsSectionStack,
} from './SaasMetricsSectionStack'

type ArrProjectionPreviewRow = { year: number; arr: number }

type MockSaasMetricsProps = {
  step: number
  complete: boolean
  saasArr?: number
  saasMrr?: number
  saasArrGrowthPct?: number
  saasChurnPct?: number
  saasCustomerChurnPct?: number
  saasNrrPct?: number
  saasGrossMarginPct?: number
  saasCac?: number
  saasCustomerConcentrationPct?: number
  saasExpansionRevenuePct?: number
  saasSmSpend?: number
  arrProjectionPreview?: ArrProjectionPreviewRow[]
  importedSaasProvenance?: {
    source?: string
    confidence?: number
    derivation_method?: string
    fiscal_year?: number
  } | null
  naceCode?: string | null
  yearlyFinancials?: ReadonlyArray<YearlyFinancials> | null
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

type ProjectionPreviewInput = {
  yearlyFinancials?: ReadonlyArray<YearlyFinancials> | null
  saasArr?: number
  saasMrr?: number
  saasArrGrowthPct?: number
  saasNrrPct?: number
  saasChurnPct?: number
  saasExpansionRevenuePct?: number
}

const mocks = vi.hoisted(() => ({
  saasProps: [] as MockSaasMetricsProps[],
  projectionInputs: [] as ProjectionPreviewInput[],
}))

vi.mock('@/components/calculator/sections/CapitalHistorySection', () => ({
  CapitalHistorySection: () => <div>capital-history</div>,
}))

vi.mock('@/components/calculator/sections/SaasMetricsSection', () => ({
  SaasMetricsSection: (props: MockSaasMetricsProps) => {
    mocks.saasProps.push(props)
    return <div>saas-metrics:{props.step}</div>
  },
}))

vi.mock('@/components/calculator/sections/saasArrProjectionPreview', () => ({
  deriveSaasArrProjectionPreview: (input: ProjectionPreviewInput) => {
    mocks.projectionInputs.push(input)
    return [{ year: 2026, arr: 1_234_000 }]
  },
}))

function formData(partial: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'DemoCo',
    businessType: 'saas',
    industry: 'software',
    country: 'BE',
    yearFounded: '2018',
    businessStructure: 'BV',
    ownerManagers: 1,
    fteEmployees: undefined,
    yearlyFinancials: [],
    ...partial,
  }
}

describe('SaasMetricsSectionStack', () => {
  it('renders capital history and maps SaaS inputs into the metrics section', () => {
    const onFieldChange = vi.fn()
    const yearlyFinancials: YearlyFinancials[] = [
      { year: '2024', revenue: 1_000_000, ebitda: 100_000 },
      { year: '2023', revenue: 800_000, ebitda: 80_000 },
    ]
    const importedSaasProvenance = {
      source: 'exact',
      confidence: 0.82,
      fiscal_year: 2024,
    }

    render(
      <SaasMetricsSectionStack
        step={7}
        methods={['dcf', 'arr_multiple']}
        formData={formData({
          yearlyFinancials,
          saas_arr: 1_200_000,
          saas_mrr: 100_000,
          saas_arr_growth_pct: 20,
          saas_churn_pct: 3,
          saas_customer_churn_pct: 2,
          saas_nrr_pct: 115,
          saas_gross_margin_pct: 82,
          saas_cac: 25_000,
          saas_customer_concentration_pct: 30,
          saas_expansion_revenue_pct: 18,
          saas_sm_spend: 120_000,
          business_context: { _imported_saas_provenance: importedSaasProvenance },
          nace_code: '6201',
        } as Partial<ManualValuationFormData>)}
        onFieldChange={onFieldChange}
        disabled
      />
    )

    expect(screen.getByText('capital-history')).toBeInTheDocument()
    expect(screen.getByText('saas-metrics:7')).toBeInTheDocument()
    expect(mocks.saasProps.at(-1)).toMatchObject({
      step: 7,
      complete: true,
      saasArr: 1_200_000,
      saasMrr: 100_000,
      saasArrGrowthPct: 20,
      saasChurnPct: 3,
      saasCustomerChurnPct: 2,
      saasNrrPct: 115,
      saasGrossMarginPct: 82,
      saasCac: 25_000,
      saasCustomerConcentrationPct: 30,
      saasExpansionRevenuePct: 18,
      saasSmSpend: 120_000,
      arrProjectionPreview: [{ year: 2026, arr: 1_234_000 }],
      importedSaasProvenance,
      naceCode: '6201',
      yearlyFinancials,
      onFieldChange,
      disabled: true,
    })
    expect(mocks.projectionInputs.at(-1)).toMatchObject({
      yearlyFinancials,
      saasArr: 1_200_000,
      saasMrr: 100_000,
      saasArrGrowthPct: 20,
      saasNrrPct: 115,
      saasChurnPct: 3,
      saasExpansionRevenuePct: 18,
    })
  })

  it('skips ARR projection preview when DCF is not active', () => {
    render(
      <SaasMetricsSectionStack
        step={7}
        methods={['arr_multiple']}
        formData={formData()}
        onFieldChange={vi.fn()}
      />
    )

    expect(mocks.saasProps.at(-1).arrProjectionPreview).toEqual([])
  })
})

describe('SaaS stack derivations', () => {
  it('derives imported SaaS provenance from business context', () => {
    expect(
      deriveImportedSaasProvenance({
        _imported_saas_provenance: { source: 'exact', confidence: 0.9 },
      })
    ).toEqual({ source: 'exact', confidence: 0.9 })
    expect(deriveImportedSaasProvenance({})).toBeNull()
    expect(deriveImportedSaasProvenance(null)).toBeNull()
  })

  it('marks the SaaS section complete from ARR, MRR, growth, or gross margin', () => {
    expect(deriveSaasSectionComplete(formData())).toBe(false)
    expect(deriveSaasSectionComplete(formData({ saas_arr: 1 }))).toBe(true)
    expect(deriveSaasSectionComplete(formData({ saas_mrr: 1 }))).toBe(true)
    expect(deriveSaasSectionComplete(formData({ saas_arr_growth_pct: 0 }))).toBe(true)
    expect(deriveSaasSectionComplete(formData({ saas_gross_margin_pct: 0 }))).toBe(true)
  })
})
