import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdaptiveSections } from './ManualInputPanel'

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
