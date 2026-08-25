import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualValuationFormData } from '@/types/valuation'
import { FiscalReferenceSectionStack } from './FiscalReferenceSectionStack'
import { shouldMountFiscalReferenceSectionStack } from './sectionEligibility'

vi.mock('@/components/calculator/sections/FiscalInputsSection', () => ({
  FiscalInputsSection: ({ step }: { step: number }) => <div>fiscal-inputs:{step}</div>,
}))

const previewCurrencyFormatter = new Intl.NumberFormat('nl-BE', {
  style: 'currency',
  currency: 'EUR',
})

const formData = {
  companyName: 'DemoCo',
  businessType: 'services',
  industry: 'consulting',
  country: 'BE',
  yearFounded: '2015',
  businessStructure: 'BV',
  ownerManagers: 1,
  yearlyFinancials: [],
} as ManualValuationFormData

describe('FiscalReferenceSectionStack', () => {
  it('renders source-input fields without a locally calculated fiscal value', () => {
    render(
      <FiscalReferenceSectionStack
        methods={['fiscal_4x']}
        bonusSections={['fiscal_inputs']}
        formData={formData}
        previewCurrencyFormatter={previewCurrencyFormatter}
        fiscalStep={6}
        firmCountryCode="BE"
        onFieldChange={vi.fn()}
      />
    )

    expect(screen.getByText('fiscal-inputs:6')).toBeInTheDocument()
    expect(screen.queryByText('fiscal-preview')).not.toBeInTheDocument()
  })

  it('does not mount a value-only notice when no input section is required', () => {
    expect(
      shouldMountFiscalReferenceSectionStack({
        methods: ['fiscal_4x'],
        firmCountryCode: 'BE',
        bonusSections: [],
      })
    ).toBe(false)
  })

  it('does not mount the Belgian fiscal input stack for an NL firm', () => {
    expect(
      shouldMountFiscalReferenceSectionStack({
        methods: ['fiscal_4x'],
        firmCountryCode: 'nl',
        bonusSections: ['fiscal_inputs'],
      })
    ).toBe(false)
  })
})
