import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { AdjustedNavSectionStack } from './AdjustedNavSectionStack'

type MockStepProps = {
  step: string | number
}

type MockScheduleProps = MockStepProps & {
  realEstateAppraisalMeerwaarde?: number | null
  equipmentRevaluationMeerwaarde?: number | null
  hasRealEstateAppraisalSwap?: boolean
  bookReferences?: Record<string, number | null>
  onPerAssetTaxRateChange?: (patch: Record<string, number | undefined>) => void
}

const mocks = vi.hoisted(() => ({
  scheduleProps: [] as MockScheduleProps[],
  appraisalProps: [] as MockStepProps[],
  equipmentProps: [] as MockStepProps[],
  dealProps: [] as MockStepProps[],
}))

vi.mock('@/components/calculator/sections/NavAssetScheduleSection', () => ({
  NavAssetScheduleSection: (props: MockScheduleProps) => {
    mocks.scheduleProps.push(props)
    return <div>nav-schedule:{props.step}</div>
  },
}))

vi.mock('@/components/calculator/sections/NavRealEstateAppraisalSection', () => ({
  NavRealEstateAppraisalSection: (props: MockStepProps) => {
    mocks.appraisalProps.push(props)
    return <div>nav-real-estate:{props.step}</div>
  },
}))

vi.mock('@/components/calculator/sections/NavEquipmentLifespanSection', () => ({
  computeEquipmentMeerwaarde: vi.fn(() => 123_000),
  NavEquipmentLifespanSection: (props: MockStepProps) => {
    mocks.equipmentProps.push(props)
    return <div>nav-equipment:{props.step}</div>
  },
}))

vi.mock('@/components/calculator/sections/DealStructureCompareSection', () => ({
  DealStructureCompareSection: (props: MockStepProps) => {
    mocks.dealProps.push(props)
    return <div>nav-deal:{props.step}</div>
  },
}))

const latestCompleteYearlyFinancial: YearlyFinancials = {
  year: '2024',
  revenue: 1_000_000,
  ebitda: 150_000,
  inventory: 80_000,
  accounts_receivable: 60_000,
  total_assets: 700_000,
  total_liabilities: 300_000,
}

function formData(partial: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'DemoCo',
    businessType: 'industrial',
    industry: 'manufacturing',
    country: 'BE',
    yearFounded: '2010',
    businessStructure: 'BV',
    ownerManagers: 1,
    fteEmployees: undefined,
    yearlyFinancials: [],
    real_estate_book_value: 400_000,
    nav_tax_latency_pct: 25,
    nav_real_estate_book_value: 400_000,
    nav_real_estate_appraisal_value: 550_000,
    nav_equipment_revaluation: {
      acquisition_year: 2018,
      economic_useful_life_years: 10,
    },
    deal_buyer_discount_rate_pct: 10,
    deal_registration_duty_pct: 12.5,
    deal_type: 'compare',
    ...partial,
  }
}

describe('AdjustedNavSectionStack', () => {
  it('renders the NAV card stack and owns NAV-specific preview wiring', () => {
    const onAnyFieldChange = vi.fn()

    render(
      <AdjustedNavSectionStack
        step={6}
        formData={formData({ nav_per_asset_tax_rates: { real_estate: 5 } })}
        latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
        onFieldChange={vi.fn()}
        onAnyFieldChange={onAnyFieldChange}
      />
    )

    expect(screen.getByText('nav-schedule:6')).toBeInTheDocument()
    expect(screen.getByText('nav-real-estate:6b')).toBeInTheDocument()
    expect(screen.getByText('nav-equipment:6c')).toBeInTheDocument()
    expect(screen.getByText('nav-deal:6d')).toBeInTheDocument()

    expect(mocks.scheduleProps.at(-1).realEstateAppraisalMeerwaarde).toBe(150_000)
    expect(mocks.scheduleProps.at(-1).equipmentRevaluationMeerwaarde).toBe(123_000)
    expect(mocks.scheduleProps.at(-1).hasRealEstateAppraisalSwap).toBe(true)
    expect(mocks.scheduleProps.at(-1).bookReferences).toMatchObject({
      inventory: 80_000,
      accountsReceivable: 60_000,
      bookEquity: 400_000,
    })

    mocks.scheduleProps.at(-1).onPerAssetTaxRateChange({ inventory: 18 })
    expect(onAnyFieldChange).toHaveBeenLastCalledWith('nav_per_asset_tax_rates', {
      real_estate: 5,
      inventory: 18,
    })
  })

  it('omits edit-only NAV subcards when generic writes are unavailable', () => {
    render(
      <AdjustedNavSectionStack
        step={6}
        formData={formData()}
        latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText('nav-schedule:6')).toBeInTheDocument()
    expect(screen.getByText('nav-real-estate:6b')).toBeInTheDocument()
    expect(screen.queryByText('nav-equipment:6c')).not.toBeInTheDocument()
    expect(screen.queryByText('nav-deal:6d')).not.toBeInTheDocument()
  })
})
