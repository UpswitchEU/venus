import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdaptiveSections, OfficialFilingTrustPanel } from './ManualInputPanel'

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key,
}))

describe('AdaptiveSections', () => {
  const baseProps = {
    formData: {} as any,
    onFieldChange: vi.fn(),
    disabled: false,
  }

  it('renders the DCF and SaaS sections together when both rules apply', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="tech-digital"
        businessTypeId="saas"
      />
    )

    expect(screen.getByText('sections.dcfProjections')).toBeInTheDocument()
    expect(screen.getByText('sections.saasMetrics')).toBeInTheDocument()
    expect(screen.getByText('fields.saasArrGrowthPct')).toBeInTheDocument()
    expect(screen.getByText('fields.saasGrossMarginPct')).toBeInTheDocument()
    expect(screen.getByText('fields.ruleOf40Score')).toBeInTheDocument()
    expect(screen.queryByText('sections.navAssetSchedule')).not.toBeInTheDocument()
  })

  it('removes method-specific sections when switching back to adaptive and restores them later', async () => {
    const { rerender } = render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="tech-digital"
        businessTypeId="saas"
      />
    )

    expect(screen.getByText('sections.dcfProjections')).toBeInTheDocument()

    rerender(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="upswitch_adaptive"
        businessCategory="tech-digital"
        businessTypeId="saas"
      />
    )

    await waitFor(() => {
      expect(screen.queryByText('sections.dcfProjections')).not.toBeInTheDocument()
    })
    expect(screen.getByText('sections.saasMetrics')).toBeInTheDocument()

    rerender(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="tech-digital"
        businessTypeId="saas"
      />
    )

    expect(screen.getByText('sections.dcfProjections')).toBeInTheDocument()
  })

  it('renders revenue-led guidance when omzet multiple is pre-selected', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="omzet_multiple"
        businessCategory="professional-services"
        businessTypeId="accountancy"
      />
    )

    expect(screen.getByText('revenueDriverTitle')).toBeInTheDocument()
    expect(screen.getByText('revenueDriverText')).toBeInTheDocument()
    expect(screen.getByText('sections.revenueQuality')).toBeInTheDocument()
  })

  it('renders the fiscal disclaimer when fiscal 4x is selected', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="fiscal_4x"
        businessCategory="holding"
        businessTypeId="family-holdco"
      />
    )

    expect(screen.getByText('fiscalDisclaimerTitle')).toBeInTheDocument()
    expect(screen.getByText('fiscalDisclaimerText')).toBeInTheDocument()
  })

  it('hides the fiscal disclaimer for NL accountant firms even if fiscal 4x is selected', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="fiscal_4x"
        firmCountryCode="NL"
        businessCategory="holding"
        businessTypeId="family-holdco"
      />
    )

    expect(screen.queryByText('fiscalDisclaimerTitle')).not.toBeInTheDocument()
  })
})

describe('OfficialFilingTrustPanel', () => {
  const formatCurrency = (value: number) => `EUR ${value.toLocaleString('nl-BE')}`

  it('renders the verification badge and official values when filing data exists', () => {
    render(
      <OfficialFilingTrustPanel
        locale="nl"
        formatCurrency={formatCurrency}
        officialFinancials={{
          sourceLabel: 'NBB filing via Staatsbladmonitor',
          filingYear: 2024,
          revenue: 1250000,
          ebitda: 150000,
        }}
        officialVerificationBadge={{
          state: 'verified',
          label: 'Verified by NBB',
        }}
        officialVarianceAnalysis={{
          state: 'not_required',
          explanationRequired: false,
        }}
        onExplanationChange={vi.fn()}
      />
    )

    expect(screen.getByText('Officiële filing cross-check')).toBeInTheDocument()
    expect(screen.getByText('Verified by NBB')).toBeInTheDocument()
    expect(screen.getByText(/Boekjaar 2024/)).toBeInTheDocument()
    expect(screen.getByText(/EUR 1.250.000/)).toBeInTheDocument()
    expect(screen.getByText(/EUR 150.000/)).toBeInTheDocument()
  })

  it('renders an explanation field only when variance explanation is required', () => {
    const onExplanationChange = vi.fn()

    render(
      <OfficialFilingTrustPanel
        locale="en"
        formatCurrency={formatCurrency}
        officialFinancials={{
          filingYear: 2024,
          revenue: 800000,
        }}
        officialVerificationBadge={{
          state: 'partial',
          label: 'Partial official filing',
        }}
        officialVarianceAnalysis={{
          state: 'pending',
          explanationRequired: true,
        }}
        onExplanationChange={onExplanationChange}
      />
    )

    const explanation = screen.getByPlaceholderText(
      'Explain why your input differs from the official filing.'
    )
    expect(explanation).toBeInTheDocument()

    fireEvent.change(explanation, { target: { value: 'Seasonal slowdown in Q4' } })
    expect(onExplanationChange).toHaveBeenCalledTimes(1)
    expect(onExplanationChange).toHaveBeenLastCalledWith('Seasonal slowdown in Q4')
  })

  it('hides the explanation field when no variance explanation is required', () => {
    render(
      <OfficialFilingTrustPanel
        locale="en"
        formatCurrency={formatCurrency}
        officialFinancials={{
          filingYear: 2024,
          revenue: 800000,
        }}
        officialVerificationBadge={{
          state: 'verified',
          label: 'Verified by NBB',
        }}
        officialVarianceAnalysis={{
          state: 'not_required',
          explanationRequired: false,
        }}
        onExplanationChange={vi.fn()}
      />
    )

    expect(
      screen.queryByPlaceholderText('Explain why your input differs from the official filing.')
    ).not.toBeInTheDocument()
  })
})
