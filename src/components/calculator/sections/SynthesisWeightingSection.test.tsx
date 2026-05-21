import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SynthesisWeightingSection } from './SynthesisWeightingSection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key,
}))

vi.mock('./ValuationSectionHeader', () => ({
  ValuationSectionHeader: ({ title }: { title: React.ReactNode }) => <h3>{title}</h3>,
}))

describe('SynthesisWeightingSection', () => {
  it('marks DCF rows when the weighted synthesis uses an APV tax-shield bridge', () => {
    render(
      <SynthesisWeightingSection
        methods={['dcf', 'ebitda_multiple']}
        weights={{ dcf: 40, ebitda_multiple: 60 }}
        justification=""
        onWeightsChange={vi.fn()}
        onJustificationChange={vi.fn()}
        step={6}
        valuationResults={{
          dcf: {
            value: 1496.04473548765,
            label: 'DCF',
            available: true,
            details: {
              dcf_equity_value_before_apv: 1493.29423191989,
              apv_tax_shield_value: 2.75050356775371,
              apv_discounting_convention: 'year_end',
              apv_bridge_provenance: {
                benchmark_style: 'customer_template_apv',
                customer_template_reconciliation: true,
              },
            },
          },
          ebitda_multiple: {
            value: 1200,
            label: 'EBITDA multiple',
            available: true,
          },
        }}
      />
    )

    expect(screen.getAllByText('apvCustomerTemplateBasis').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/apvBridge/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('+€3').length).toBeGreaterThan(0)
  })

  it('keeps non-template APV rows on the generic APV basis label', () => {
    render(
      <SynthesisWeightingSection
        methods={['dcf', 'ebitda_multiple']}
        weights={{ dcf: 40, ebitda_multiple: 60 }}
        justification=""
        onWeightsChange={vi.fn()}
        onJustificationChange={vi.fn()}
        step={6}
        valuationResults={{
          dcf: {
            value: 1496.04473548765,
            label: 'DCF',
            available: true,
            details: {
              dcf_equity_value_before_apv: 1493.29423191989,
              apv_tax_shield_value: 2.75050356775371,
              apv_discounting_convention: 'mid_year',
              apv_bridge_provenance: {
                benchmark_style: 'valuationiq_mid_year_apv',
                customer_template_reconciliation: false,
              },
            },
          },
          ebitda_multiple: {
            value: 1200,
            label: 'EBITDA multiple',
            available: true,
          },
        }}
      />
    )

    expect(screen.getAllByText('apvBasis').length).toBeGreaterThan(0)
    expect(screen.queryByText('apvCustomerTemplateBasis')).toBeNull()
  })
})
