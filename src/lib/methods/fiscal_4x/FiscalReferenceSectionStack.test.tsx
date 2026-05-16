import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Fiscal4xPreviewMetrics } from '@/lib/omniPreview'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { FiscalReferenceSectionStack } from './FiscalReferenceSectionStack'
import {
  shouldMountFiscalReferenceSectionStack,
  shouldShowFiscalReferenceNotice,
} from './sectionEligibility'

type MockFiscalPreviewProps = {
  fiscalPreview: Fiscal4xPreviewMetrics
  previewCurrencyFormatter: Intl.NumberFormat
  unavailableMessage: string | null
}

type MockFiscalInputsProps = {
  step: number
  fiscalAcquisitionCost?: number
  fiscalAnchor2Value?: number
  fiscalAnchor3Value?: number
  fiscalAnchor4Value?: number
  onFieldChange: (field: string, value: number | undefined) => void
  disabled?: boolean
}

const mocks = vi.hoisted(() => ({
  previewProps: [] as MockFiscalPreviewProps[],
  inputProps: [] as MockFiscalInputsProps[],
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/calculator/sections/FiscalReferencePreviewCard', () => ({
  FiscalReferencePreviewCard: (props: MockFiscalPreviewProps) => {
    mocks.previewProps.push(props)
    return <div>fiscal-preview</div>
  },
}))

vi.mock('@/components/calculator/sections/FiscalInputsSection', () => ({
  FiscalInputsSection: (props: MockFiscalInputsProps) => {
    mocks.inputProps.push(props)
    return <div>fiscal-inputs:{props.step}</div>
  },
}))

const previewCurrencyFormatter = new Intl.NumberFormat('nl-BE', {
  style: 'currency',
  currency: 'EUR',
})

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

const latestCompleteYearlyFinancial: YearlyFinancials = {
  year: '2024',
  revenue: 1_250_000,
  ebitda: 180_000,
  total_equity: 400_000,
}

describe('FiscalReferenceSectionStack', () => {
  beforeEach(() => {
    mocks.previewProps = []
    mocks.inputProps = []
  })

  it('renders the Belgian fiscal preview and maps tax anchor inputs', () => {
    const onFieldChange = vi.fn()

    render(
      <FiscalReferenceSectionStack
        methods={['fiscal_4x']}
        bonusSections={['fiscal_inputs']}
        formData={formData({
          fiscal_acquisition_cost: 100_000,
          fiscal_anchor_2_value: 120_000,
          fiscal_anchor_3_value: 140_000,
          fiscal_anchor_4_value: 160_000,
          shares_for_sale: 50,
        })}
        latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
        previewCurrencyFormatter={previewCurrencyFormatter}
        fiscalStep={6}
        firmCountryCode="BE"
        onFieldChange={onFieldChange}
        disabled
        fiscalWeightedNormalizedEbitda={300_000}
        fiscalWeightedHistoricalYearCount={3}
      />
    )

    expect(screen.getByText('fiscal-preview')).toBeInTheDocument()
    expect(screen.getByText('fiscal-inputs:6')).toBeInTheDocument()
    expect(mocks.previewProps.at(-1)?.fiscalPreview).toMatchObject({
      available: true,
      ebitdaForAnchor: 300_000,
      ebitdaSource: 'weighted_normalized_historical',
      fiscalAnchor: 1_200_000,
      bookEquityUsed: 400_000,
      impliedFiscalEquity: 800_000,
      ownershipMultiplierApplied: 0.5,
    })
    expect(mocks.inputProps.at(-1)).toMatchObject({
      step: 6,
      fiscalAcquisitionCost: 100_000,
      fiscalAnchor2Value: 120_000,
      fiscalAnchor3Value: 140_000,
      fiscalAnchor4Value: 160_000,
      onFieldChange,
      disabled: true,
    })
  })

  it('hides the Belgian preview for NL firms while preserving fiscal inputs', () => {
    render(
      <FiscalReferenceSectionStack
        methods={['fiscal_4x']}
        bonusSections={['fiscal_inputs']}
        formData={formData()}
        latestCompleteYearlyFinancial={latestCompleteYearlyFinancial}
        previewCurrencyFormatter={previewCurrencyFormatter}
        fiscalStep={6}
        firmCountryCode="NL"
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.queryByText('fiscal-preview')).not.toBeInTheDocument()
    expect(screen.getByText('fiscal-inputs:6')).toBeInTheDocument()
    expect(mocks.previewProps).toHaveLength(0)
  })

  it('keeps fiscal stack eligibility method-owned', () => {
    expect(shouldShowFiscalReferenceNotice(['fiscal_4x'], 'BE')).toBe(true)
    expect(shouldShowFiscalReferenceNotice(['fiscal_4x'], 'NL')).toBe(false)
    expect(
      shouldMountFiscalReferenceSectionStack({
        methods: ['dcf'],
        firmCountryCode: 'BE',
        bonusSections: ['fiscal_inputs'],
      })
    ).toBe(true)
  })
})
