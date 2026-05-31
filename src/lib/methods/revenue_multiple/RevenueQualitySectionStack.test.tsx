import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { RevenueQualitySectionStack } from './RevenueQualitySectionStack'

type MockRevenueQualitySectionProps = {
  step: number
  revContractBacklog?: number
  revRecurringAmount?: number
  revTopClientAmount?: number
  revGrossChurnPct?: number
  revCapitalizedRdAmount?: number
  latestRevenue?: number
  effectiveMethods?: string[]
  businessTypeId?: string
  businessCategory?: string
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

const mocks = vi.hoisted(() => ({
  sectionProps: [] as MockRevenueQualitySectionProps[],
}))

vi.mock('@/components/calculator/sections/RevenueQualitySection', () => ({
  RevenueQualitySection: (props: MockRevenueQualitySectionProps) => {
    mocks.sectionProps.push(props)
    return <div>revenue-quality:{props.step}</div>
  },
}))

const latestCompleteYearlyFinancial: YearlyFinancials = {
  year: '2024',
  revenue: 1_250_000,
  ebitda: 225_000,
}

function formData(partial: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'DemoCo',
    businessType: 'services',
    industry: 'consulting',
    country: 'BE',
    yearFounded: '2015',
    businessStructure: 'BV',
    ownerManagers: 1,
    fteEmployees: undefined,
    yearlyFinancials: [],
    ...partial,
  }
}

describe('RevenueQualitySectionStack', () => {
  it('maps revenue quality inputs and latest revenue into the section', () => {
    const onFieldChange = vi.fn()

    render(
      <RevenueQualitySectionStack
        step={7}
        methods={['omzet_multiple', 'ebitda_multiple']}
        businessTypeId="saas"
        businessCategory="technology"
        formData={formData({
          rev_contract_backlog: 300_000,
          rev_recurring_amount: 700_000,
          rev_top_client_amount: 250_000,
          rev_gross_churn_pct: 8,
          rev_capitalized_rd_amount: 50_000,
        })}
        latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
        onFieldChange={onFieldChange}
        disabled
      />
    )

    expect(mocks.sectionProps.at(-1)).toMatchObject({
      step: 7,
      revContractBacklog: 300_000,
      revRecurringAmount: 700_000,
      revTopClientAmount: 250_000,
      revGrossChurnPct: 8,
      revCapitalizedRdAmount: 50_000,
      latestRevenue: 1_250_000,
      effectiveMethods: ['omzet_multiple', 'ebitda_multiple'],
      businessTypeId: 'saas',
      businessCategory: 'technology',
      onFieldChange,
      disabled: true,
    })
  })

  it('keeps latest revenue undefined when no complete year is available', () => {
    render(
      <RevenueQualitySectionStack
        step={7}
        methods={['revenue_multiple']}
        formData={formData()}
        onFieldChange={vi.fn()}
      />
    )

    expect(mocks.sectionProps.at(-1)).toMatchObject({
      latestRevenue: undefined,
      effectiveMethods: ['revenue_multiple'],
    })
  })

  it('falls back to API historical year data for the ratio denominator', () => {
    render(
      <RevenueQualitySectionStack
        step={7}
        methods={['revenue_multiple']}
        formData={formData({
          historical_years_data: [
            { year: 2024, revenue: 900_000, ebitda: 90_000 },
            { year: 2025, revenue: 1_000_000, ebitda: 100_000 },
          ],
        })}
        onFieldChange={vi.fn()}
      />
    )

    expect(mocks.sectionProps.at(-1)).toMatchObject({
      latestRevenue: 1_000_000,
      effectiveMethods: ['revenue_multiple'],
    })
  })

  it('normalizes persisted locale-formatted amounts before rendering the section', () => {
    render(
      <RevenueQualitySectionStack
        step={7}
        methods={['revenue_multiple']}
        formData={
          formData({
            rev_contract_backlog: '250.000',
            rev_recurring_amount: '400.000',
            rev_top_client_amount: '150.000',
            revenue: '1.000.000',
          } as unknown as Partial<ManualValuationFormData>)
        }
        onFieldChange={vi.fn()}
      />
    )

    expect(mocks.sectionProps.at(-1)).toMatchObject({
      revContractBacklog: 250_000,
      revRecurringAmount: 400_000,
      revTopClientAmount: 150_000,
      latestRevenue: 1_000_000,
    })
  })
})
